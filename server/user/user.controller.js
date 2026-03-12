const User = require("./user.model");
const AdjustWebhookRecord = require('./adjustWebhookRecord.model');
const moment = require("moment");
const mongoose = require("mongoose");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

//jwt token
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

//import model
const premiumPlan = require("../premiumPlan/premiumPlan.model");
const Comment = require("../comment/comment.model");
const Download = require("../download/download.model");
const Favorite = require("../favorite/favorite.model");
const CommentLike = require("../like/like.model");
const Notification = require("../notification/notification.model");
const PremiumPlanHistory = require("../premiumPlan/premiumPlanHistory.model");
const Rating = require("../rating/rating.model");
const TicketByUser = require("../ticketByUser/ticketByUser.model");
const ViewedContent = require("../viewedContent/viewedContent.model");
const Setting = require("../setting/setting.model");
const { capturePayment, captureEvent, getAttributedUsers } = require('../../util/linkrunner');
const { trackGA4SubscriptionRenewed, trackGA4PlanRevenue } = require('../../util/googleAnalytics');
const { moengageTrackUser, sendPlatformEventToMoEngage } = require("../../util/moengage")
const { captureWebSignUpEvent } = require('../../util/adjust');
const JWT_SECRET = process?.env?.JWT_SECRET;

//deleteFromAzure
const { deleteFromAzure } = require("../../util/deleteFromAzure");
const { SNS } = require("../../util/awsServices");
const premiumPlanModel = require("../premiumPlan/premiumPlan.model");
const premiumPlanHistoryModel = require("../premiumPlan/premiumPlanHistory.model");
const couponService = require("../coupon/coupon.service");
const { redisClient } = require('../../config/redis');

// MSG91 Service
const msg91Service = require("../../util/msg91Service");
const { validateAndNormalizePhone } = require("../../util/phoneValidator");

const userFunction = async (user, data_) => {
  const data = data_.body;

  const randomChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let password = "";
  for (let i = 0; i < 8; i++) {
    password += randomChars.charAt(
      Math.floor(Math.random() * randomChars.length)
    );
  }

  user.image = data.image ? data.image : user.image;
  user.fullName = data.fullName ? data.fullName : user.fullName;
  user.nickName = data.nickName ? data.nickName : user.nickName;
  user.email = data.email ? data.email.trim() : user.email;
  user.gender = data.gender ? data.gender.toLowerCase().trim() : user.gender;
  user.country = data.country ? data.country.trim() : user.country;
  user.loginType = data.loginType ? data.loginType : user.loginType;
  user.identity = data.identity;
  user.fcmToken = data.fcmToken;
  user.referralCode = data.referralCode ? data.referralCode : user.referralCode;
  user.uniqueId = !user.uniqueId
    ? await Promise.resolve(generateUserName())
    : user.uniqueId;
  user.password = !user.password ? password : user.password;

  await user.save();
  return user;
};

const generateAccessToken = (_id, deviceId) => {
  return jwt.sign({ _id, deviceId }, JWT_SECRET, { expiresIn: "15m" });
};

const generateRefreshToken = (_id, deviceId) => {
  return jwt.sign({ _id, deviceId }, JWT_SECRET, { expiresIn: "7d" });
};

//generate new unique username
const generateUserName = async () => {
  const random = () => {
    return Math.floor(Math.random() * (999999999 - 100000000)) + 100000000;
  };

  var uniqueId = random();

  let user = await User.findOne({ uniqueId: uniqueId });
  while (user) {
    uniqueId = random();
    user = await User.findOne({ uniqueId: uniqueId });
  }

  return uniqueId;
};

//check user plan is expired or not
const checkPlan = async (userId, res) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(200)
        .json({ status: false, message: "User does not found!!" });
    }

    if (user.plan.planStartDate !== null && user.plan.premiumPlanId !== null) {
      const plan = await premiumPlan.findById(user.plan.premiumPlanId);
      if (!plan) {
        return res
          .status(200)
          .json({ status: false, message: "Plan does not found!!" });
      }

      if (plan.validityType.toLowerCase() === "day") {
        const diffTime = moment(new Date()).diff(
          moment(new Date(user.plan.planStartDate)),
          "day"
        );
        if (diffTime > plan.validity) {
          user.isPremiumPlan = false;
          user.plan.planStartDate = null;
          user.plan.planEndDate = null;
          user.plan.premiumPlanId = null;
        }
      }

      if (plan.validityType.toLowerCase() === "month") {
        const diffTime = moment(new Date()).diff(
          moment(new Date(user.plan.planStartDate)),
          "month"
        );
        if (diffTime >= plan.validity) {
          user.isPremiumPlan = false;
          user.plan.planStartDate = null;
          user.plan.planEndDate = null;
          user.plan.premiumPlanId = null;
        }
      }

      if (plan.validityType.toLowerCase() === "year") {
        const diffTime = moment(new Date()).diff(
          moment(new Date(user.plan.planStartDate)),
          "year"
        );
        if (diffTime >= plan.validity) {
          user.isPremiumPlan = false;
          user.plan.planStartDate = null;
          user.plan.planEndDate = null;
          user.plan.premiumPlanId = null;
        }
      }
    }

    await user.save();

    const dataOfUser = await User.findById(user._id).populate(
      "plan.premiumPlanId"
    );
    return dataOfUser;
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Sever Error",
    });
  }
};

//user login and sign up
exports.store = async (req, res) => {
  try {

    if (
      !req.body.identity ||
      !req.body.loginType
      //|| !req.body.fcmToken
    )
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details!!" });

    let userQuery;

    if (req.body.loginType == 0 || req.body.loginType == 1) {
      if (!req.body.email) {
        return res
          .status(200)
          .json({ status: false, message: "Email is required!!" });
      }

      // userQuery = await User.findOne({ email: req.body.email });
      if (req.body.identity) {
        userQuery = await User.findOne({
          $and: [{ identity: req.body.identity }, { email: req.body.email }],
        });
      }
    } else if (req.body.loginType == 2) {
      if (!req.body.identity) {
        return res
          .status(200)
          .json({ status: false, message: "Identity is required!!" });
      }

      userQuery = await User.findOne({ identity: req.body.identity });
    }
    // else if (req.body.loginType == 3) {
    //   if (!req.body.email && !req.body.password) {
    //     return res.status(200).json({
    //       status: false,
    //       message: "Email and Password both are required !",
    //     });
    //   }

    //   const emailExist = await User.findOne({ uniqueId: req.body.email });
    //   if (!emailExist) {
    //     return res.status(200).json({ status: false, message: "Id is Wrong!" });
    //   } else {
    //     if (emailExist.password !== req.body.password) {
    //       return res
    //         .status(200)
    //         .json({ status: false, message: "Password is Wrong!" });
    //     } else {
    //       const user_ = await userFunction(emailExist, req);

    //       return res.status(200).json({
    //         status: true,
    //         message: "Login Success!!",
    //         user: user_,
    //       });
    //     }
    //   }
    // }

    const user = userQuery;

    if (user) {
      if (user.isBlock) {
        return res
          .status(200)
          .json({ status: false, message: "You are blocked by admin!!" });
      }

      const user_ = await userFunction(user, req);

      const downloaduserId = await Download.find({
        userId: user._id,
      }).distinct("_id");

      if (downloaduserId) {
        await Download.deleteMany({})
          .then(function () {
            console.log("Data deleted"); // Success
          })
          .catch(function (error) {
            console.log(error); // Failure
          });
      }

      return res.status(200).json({
        status: true,
        message: "User login Successfully!!",
        user: user_,
        signup: false,
        isProfile: true,
      });
    } else {

      const newUser = new User();

      const randomChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let referralCode = "";
      for (let i = 0; i < 8; i++) {
        referralCode += randomChars.charAt(
          Math.floor(Math.random() * randomChars.length)
        );
      }
      newUser.referralCode = referralCode;
      newUser.date = new Date().toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
      });

      const user = await userFunction(newUser, req);

      return res.status(200).json({
        status: true,
        message: "User Signup Successfully!",
        user,
        signup: true,
        isProfile: false,
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Sever Error!!",
    });
  }
};

//get user profile who login
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .populate({ path: "plan.premiumPlanId", select: "-isAutoRenew -createdAt -updatedAt" })
      .populate({ path: "plan.historyId", select: "_id paymentGateway amount transactionId razorpaySubscriptionId googlePlayPurchaseToken isFreeTrial" })

    if (!user) {
      return res
        .status(200)
        .json({ status: false, message: "User does not found." });
    }

    // // if (user.plan.premiumPlanId !== null && user.plan.planStartDate !== null) {
    //   const user_ = await checkPlan(user._id);

    //   return res.status(200).json({ status: true, message: "Success", user: user_ });
    // }

    // const user_ = await checkPlan(user._id);

    // Transform the response to rename premiumPlanId to premiumPlanDetails
    const userResponse = user.toObject();
    if (userResponse.plan && userResponse.plan.premiumPlanId) {
      userResponse.plan.premiumPlanDetails = userResponse.plan.premiumPlanId;
      userResponse.plan.premiumPlanId = userResponse.plan.premiumPlanId?._id
    }
    if (userResponse.plan && userResponse.plan.historyId) {
      userResponse.plan.subscriptionDetails = userResponse.plan.historyId;
      userResponse.plan.historyId = userResponse.plan.historyId?._id
    }

    return res
      .status(200)
      .json({ status: true, message: "Success", user: userResponse });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//update profile of user
exports.updateProfile = async (req, res) => {
  try {
    if (!req.user.userId)
      return res
        .status(200)
        .json({ status: false, message: "userId must be requried." });

    const user = await User.findById(req.user.userId);
    if (!user)
      return res
        .status(200)
        .json({ status: false, message: "user does not found!" });

    // Add email validation before updating
    if (req.body.email) {
      // Regular expression for email validation
      const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;

      if (!emailRegex.test(req.body.email)) {
        return res.status(200).json({
          status: false,
          message: "Please provide a valid email address",
        });
      }

      // Check if email already exists
      // const emailExists = await User.findOne({
      //     email: req.body.email,
      //     _id: { $ne: req.user.userId }
      // });

      // if (emailExists) {
      //     return res.status(200).json({
      //         status: false,
      //         message: "This email is already registered"
      //     });
      // }
    }

    if (req?.body?.image) {
      //delete the old image from digitalOcean Spaces
      const urlParts = user?.image.split("/");
      const keyName = urlParts.pop(); //remove the last element
      const folderStructure = urlParts.slice(3).join("/"); //Join elements starting from the 4th element

      await deleteFromAzure({ folderStructure, keyName });

      user.image = req.body.image ? req.body.image : user.image;
    }

    user.fullName = req.body.fullName ? req.body.fullName : user.fullName;
    user.nickName = req.body.nickName ? req.body.nickName : user.nickName;
    user.email = req.body.email ? req.body.email : user.email;
    user.gender = req.body.gender ? req.body.gender.trim() : user.gender;
    user.country = req.body.country ? req.body.country : user.country;
    user.interest = req.body.interest
      ? req.body.interest.split(",")
      : user.interest;
    await user.save();

    // Populate premium plan data like in getProfile
    const updatedUser = await User.findById(req.user.userId)
      .populate({ path: "plan.premiumPlanId", select: "-isAutoRenew -createdAt -updatedAt" });

    // Transform the response to rename premiumPlanId to premiumPlanDetails
    const userResponse = updatedUser.toObject();
    if (userResponse.plan && userResponse.plan.premiumPlanId) {
      userResponse.plan.premiumPlanDetails = userResponse.plan.premiumPlanId;
      userResponse.plan.premiumPlanId = userResponse.plan.premiumPlanId?._id;
    }

    return res.status(200).json({
      status: true,
      message: "Profile of the user has been updated.",
      user: userResponse,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//create dummy user
exports.index = async (req, res) => {
  try {
    if (
      !req.body ||
      !req.body.fullName ||
      !req.body.nickName ||
      !req.body.gender ||
      !req.body.image
    )
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details!" });

    const user = new User();

    user.fullName = req.body.fullName;
    user.nickName = req.body.nickName;
    user.gender = req.body.gender;
    user.image = req.body.image;
    await user.save();

    return res.status(200).json({
      status: true,
      message: "Dummy User Created Successfully.",
      user,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Sever Error",
    });
  }
};

//get all user for admin
exports.get = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(Math.max(1, parseInt(limit)), 100);

    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination info
    const total = await User.countDocuments();

    // Get paginated users
    const user = await User.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const totalPages = Math.ceil(total / limitNum);

    return res.status(200).json({
      status: true,
      message: "Success",
      user,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalUsers: total,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

//get countryWise user for admin
exports.countryWiseUser = async (req, res) => {
  try {
    const user = await User.aggregate([
      {
        $group: {
          _id: "$country",
          totalUser: { $sum: 1 },
        },
      },
    ]);

    return res.status(200).json({ status: true, message: "Success", user });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

//user block or unbolck by admin
exports.blockUnblock = async (req, res) => {
  try {
    if (!req.query.userId) {
      return res
        .status(200)
        .json({ status: false, massage: "UserId is requried!!" });
    }

    const user = await User.findById(req.query.userId);
    if (!user) {
      return res
        .status(200)
        .json({ status: false, message: "User does not found!!" });
    }

    user.isBlock = !user.isBlock;
    await user.save();

    return res.status(200).json({
      status: true,
      message: "Success",
      user,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//delete user account
exports.deleteUserAccount = async (req, res) => {
  try {
    if (!req.user.userId) {
      return res
        .status(200)
        .json({ status: false, message: "userId must be required!" });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(200)
        .json({ status: false, message: "User does not found!" });
    }

    if (user.isBlock) {
      return res
        .status(200)
        .json({ status: false, message: "you are blocked by the admin." });
    }

    if (user?.image) {
      //delete the old image from digitalOcean Spaces
      const urlParts = user?.image?.split("/");
      const keyName = urlParts?.pop(); //remove the last element
      const folderStructure = urlParts?.slice(3).join("/"); //Join elements starting from the 4th element

      await deleteFromAzure({ folderStructure, keyName });
    }

    await Promise.all([
      Comment.deleteMany({ userId: user._id }),
      Download.deleteMany({ userId: user._id }),
      Favorite.deleteMany({ userId: user._id }),
      CommentLike.deleteMany({ userId: user._id }),
      Notification.deleteMany({ userId: user._id }),
      PremiumPlanHistory.deleteMany({ userId: user._id }),
      Rating.deleteMany({ userId: user._id }),
      TicketByUser.deleteMany({ userId: user._id }),
      User.deleteOne({ _id: user?._id }),
    ]);

    return res
      .status(200)
      .json({ status: true, message: "User account has been deleted." });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ status: false, error: error.message || "Internal Server Error" });
  }
};

exports.signup = async (req, res) => {
  try {
    const { email, password, deviceId, deviceInfo } = req.body;

    if (!email || !password || !deviceId) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long",
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword, deviceId });
    const { accessToken, refreshToken } = await user.createSession(
      deviceId,
      deviceInfo
    );

    await user.save();

    res.status(201).json({
      data: { _id: user._id, accessToken, refreshToken },
      message: "User registered successfully",
    });
  } catch (err) {
    res.status(400).json({
      status: false,
      message: "Error registering user",
      error: err.message,
    });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken, deviceId, deviceInfo } = req.body;

    if (!refreshToken || !deviceId) {
      return res.status(400).json({
        status: false,
        message: "Refresh token and device ID are required",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_SECRET);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          status: false,
          message: "Refresh token has expired",
          code: "TOKEN_EXPIRED",
        });
      }
      return res.status(401).json({
        status: false,
        message: "Invalid refresh token",
        code: "INVALID_TOKEN",
      });
    }

    const user = await User.findById(decoded.userId).select("+sessions");
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    const session = user.sessions.find(
      (s) => s.deviceId === deviceId && s.refreshToken === refreshToken
    );

    if (!session) {
      return res.status(401).json({
        status: false,
        message: "Invalid session",
        code: "INVALID_SESSION",
      });
    }

    const { accessToken: newAccessToken } = await user.refreshSession(deviceId);

    res.json({
      message: "Tokens refreshed successfully",
      data: { _id: user._id, accessToken: newAccessToken },
    });
  } catch (err) {
    res.status(401).json({
      status: false,
      code: "INVALID_SESSION",
      message: "Invalid or expired refresh token",
    });
  }
};

exports.logout = async (req, res) => {
  const userId = req.user.userId;
  const deviceId = req.user.deviceId;

  try {
    const user = await User.findById(userId).select("+sessions");
    if (!user) return res.status(401).json({ message: "User not found" });

    user.sessions = user.sessions.filter((s) => s.deviceId !== deviceId);
    await user.save();

    res.json({ message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error logging out", error: err.message });
  }
};

exports.testSession = async (req, res) => {
  try {
    res.json({ data: req.user, message: "Logged in user details" });
  } catch (err) {
    res.status(500).json({ message: "Error logging out", error: err.message });
  }
};

exports.newLogin = async (req, res) => {
  try {
    const { email, password, deviceId, deviceInfo, mobileNumber } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: false,
        message: "Email and password are required",
      });
    }

    if (!deviceId) {
      return res.status(400).json({
        status: false,
        message: "Device identifier is required",
      });
    }

    const verificationCode = generateOTP();

    const message = `Your verification code is: ${verificationCode}. Valid for 10 minutes.`;

    // Send SMS
    const result = await sendSMSVerification(mobileNumber, message);

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ message: "Incorrect password" });

    const { accessToken, refreshToken } = await user.createSession(
      deviceId,
      deviceInfo
    );

    return res.json({
      message: "Logged in successfully",
      data: { _id: user._id, accessToken, refreshToken },
    });
  } catch (err) {
    res.status(500).json({ message: "Error logging in", error: err.message });
  }
};

exports.verifyAndLoginSignup = async (req, res) => {
  try {
    const { phoneNumber, otp, deviceId, deviceInfo, country } = req.body;

    if (
      !phoneNumber ||
      !otp ||
      !deviceId
      // || !country
    ) {
      return res.status(400).json({
        status: false,
        message: "Phone number, OTP, DeviceId and Country are required",
      });
    }

    // Find user and verify OTP
    let user = await User.findOne({
      phoneNumber,
      otp: Number(otp),
      otpExpires: { $gt: Date.now() },
    });

    // TEMPORARY - remove in production
    if (!user && otp == "123456") {
      user = await User.findOne({
        phoneNumber,
        otpExpires: { $gt: Date.now() },
      });
    }

    if (!user) {
      return res.status(400).json({
        status: false,
        message: "Invalid or expired OTP",
      });
    }

    // Clear OTP
    user.otp = undefined;
    user.otpExpires = undefined;

    // If user was unverified, mark as verified
    if (user.phoneStatus === "UNVERIFIED") {
      user.phoneStatus = "VERIFIED";
    }

    if (country) user.country = country;

    // // Generate tokens
    // const accessToken = jwt.sign(
    //   { userId: user._id, phoneNumber: user.phoneNumber },
    //   process.env.JWT_SECRET,
    //   { expiresIn: '24h' }
    // );

    // const refreshToken = jwt.sign(
    //   { userId: user._id },
    //   process.env.JWT_REFRESH_SECRET,
    //   { expiresIn: '7d' }
    // );

    // // Save refresh token and update user
    // user.refreshToken = refreshToken;

    await user.save();

    const { accessToken, refreshToken } = await user.createSession(
      deviceId,
      deviceInfo
    );

    return res.json({
      status: true,
      message:
        user.phoneStatus === "VERIFIED"
          ? "Login successful"
          : "Registration successful",
      data: {
        _id: user._id,
        phoneNumber: user.phoneNumber,
        accessToken,
        refreshToken,
        isNewUser: user.phoneStatus === "UNVERIFIED",
      },
    });
  } catch (error) {
    console.error("Verify and login/signup error:", error);
    return res.status(500).json({
      status: false,
      message: "Error processing request",
      error: error.message,
    });
  }
};

exports.initiateLoginSignup = async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        status: false,
        message: "Phone number is required",
      });
    }

    // Validate phone number
    // const validationResult = await validatePhoneNumber(phoneNumber);
    // if (!validationResult.isValid) {
    //   return res.status(400).json({
    //     status: false,
    //     message: "Invalid phone number format"
    //   });
    // }

    // Generate OTP
    const otp = 123456
    // generateOTP();
    const expiryTime = Date.now() + 600000; // 10 minutes expiry

    // Check if user exists
    let user = await User.findOne({ phoneNumber });
    let message;

    if (user) {
      // Existing user - update OTP
      message = `Your one-time password (OTP) for logging into ${process.env.appName} is ${otp}. This code is valid for a 10 minutes only. Do not share it with anyone for security reasons.`;
      user.otp = otp;
      user.otpExpires = expiryTime;
      await user.save();
    } else {
      // New user - create unverified record
      message = `Your one-time password (OTP) for signing up on ${process.env.appName} is ${otp}. This code is valid for a 10 minutes only. Do not share it with anyone for security reasons.`;
      user = await User.create({
        phoneNumber,
        otp: otp,
        otpExpires: expiryTime,
        phoneStatus: "UNVERIFIED",
      });
    }

    // Send SMS
    // const smsResult = await sendSMSVerification(phoneNumber, message);
    // if (!smsResult?.MessageId) {
    //   return res.status(400).json({
    //     status: false,
    //     message: "Failed to send OTP",
    //   });
    // }

    return res.json({
      status: true,
      message: "OTP sent successfully",
      data: {
        phoneNumber,
        isNewUser: !user.phoneStatus || user.phoneStatus === "UNVERIFIED",
      },
    });
  } catch (error) {
    console.error("Initiate login/signup error:", error);
    return res.status(500).json({
      status: false,
      message: "Error processing request",
      error: error.message,
    });
  }
};

const sendSMSVerification = async (phoneNumber, message) => {
  try {
    const validationResult = await validatePhoneNumber(phoneNumber);
    if (!validationResult.isValid) {
      return {
        status: false,
        code: "INVALID_NUMBER",
        message: validationResult.error,
      };
    }

    if (validationResult.isOptedOut) {
      return {
        status: false,
        code: "OPTED_OUT",
        message: "Phone number has opted out of receiving SMS",
      };
    }

    const params = {
      Message: message,
      PhoneNumber: phoneNumber,
      MessageAttributes: {
        "AWS.SNS.SMS.SMSType": {
          DataType: "String",
          StringValue: "Transactional",
        },
        // 'AWS.SNS.SMS.SenderID': {
        //   DataType: 'String',
        //   StringValue: process.env.AWS_SNS_SENDER_ID || 'YourApp'
        // }
      },
    };

    return await SNS.publish(params).promise();
  } catch (error) {
    console.error("SMS sending error:", error);
    throw error;
  }
};

const validatePhoneNumber = async (phoneNumber) => {
  try {
    const params = {
      phoneNumber: phoneNumber,
    };
    const result = await SNS.checkIfPhoneNumberIsOptedOut(params).promise();
    return {
      isValid: true,
      isOptedOut: result.isOptedOut,
    };
  } catch (error) {
    if (error.code === "InvalidParameter") {
      return {
        isValid: false,
        error: "Invalid phone number format",
      };
    }
    throw error;
  }
};

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const createStripeCustomer = async (userData) => {
  try {
    const customerData = {
      email: userData.email,
      name: userData.fullName,
      metadata: {
        userId: userData._id.toString(),
      },
    };

    // if (userData.fcmToken) {
    //   customerData.metadata.fcmToken = userData.fcmToken;
    // }

    const customer = await stripe.customers.create(customerData);
    return customer;
  } catch (error) {
    throw new Error(`Stripe customer creation failed: ${error.message}`);
  }
};

const getStripeCustomer = async (customerId) => {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    return customer;
  } catch (error) {
    throw new Error(`Stripe customer retrieval failed: ${error.message}`);
  }
};

// Update stripe customer
const updateStripeCustomer = async (customerId, updateData) => {
  try {
    const customer = await stripe.customers.update(customerId, updateData);
    return customer;
  } catch (error) {
    throw new Error(`Stripe customer update failed: ${error.message}`);
  }
};

const createStripeSubscription = async (customerId, planId) => {
  try {
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [
        {
          price: planId,
        },
      ],
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
      },
      expand: ["latest_invoice.payment_intent"],
    });
    return subscription;
  } catch (error) {
    throw new Error(`Subscription creation failed: ${error.message}`);
  }
};

exports.createSubscription = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { planId } = req.body;
    const { userId } = req.user;

    if (!userId || !planId) {
      return res.status(400).json({
        status: false,
        message: "User ID and plan ID are required",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    // Get premium plan details
    const plan = await premiumPlanModel.findById(planId);
    if (!plan) {
      return res.status(404).json({
        status: false,
        message: "Plan not found",
      });
    }

    const priceId = plan.productKey;

    // Ensure user has stripe customer ID
    let stripeCustomer;
    if (!user?.plan?.customerId) {
      stripeCustomer = await createStripeCustomer(user);
      user.plan.customerId = stripeCustomer.id;
      await user.save({ session });
    }

    // Create subscription
    const subscription = await createStripeSubscription(
      user.plan.customerId,
      priceId
    );

    // Save subscription history
    const history = await premiumPlanHistoryModel.create(
      {
        userId: userId,
        premiumPlanId: planId,
        paymentGateway: "stripe",
        amount: plan.price,
        currency: plan.currency || "INR", // Changed from "USD" to "INR"
        status: subscription.status,
        transactionId: subscription.id,
        date: new Date(),
      },
      { session }
    );

    user.plan.historyId = history._id;
    await user.save();

    await session.commitTransaction();

    // Return the subscription details and client secret
    return res.status(200).json({
      status: true,
      message: "Subscription initiated successfully",
      data: {
        subscriptionId: subscription.id,
        clientSecret: subscription.latest_invoice.payment_intent.client_secret,
        status: subscription.status,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Subscription creation error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error!!",
    });
  } finally {
    session.endSession();
  }
};

exports.updateSubscription = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { planId } = req.body;
    const { userId } = req.user;

    // Find user and validate subscription
    const user = await User.findById(userId);
    const subscriptionId = user?.plan?.subscriptionId;
    if (!user?.plan?.subscriptionId) {
      return res.status(404).json({
        status: false,
        message: "No active subscription found",
      });
    }

    if (!planId) {
      return res.status(400).json({
        status: false,
        message: "PlanId ID are required",
      });
    }

    const plan = await premiumPlanModel.findById(planId);
    if (!plan) {
      return res.status(404).json({
        status: false,
        message: "Plan not found",
      });
    }

    const newPriceId = plan.productKey;

    // Retrieve current subscription
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Update subscription with new price
    const updatedSubscription = await stripe.subscriptions.update(
      subscriptionId,
      {
        cancel_at_period_end: false,
        proration_behavior: "create_prorations",
        items: [
          {
            id: subscription.items.data[0].id,
            price: newPriceId,
          },
        ],
      }
    );

    // Update subscription history
    await premiumPlanHistoryModel.findOneAndUpdate(
      {
        userId,
        transactionId: subscriptionId,
      },
      {
        status: updatedSubscription.status,
        premiumPlanId: planId,
      },
      { session }
    );

    // Update user's plan
    await User.findByIdAndUpdate(
      userId,
      {
        "plan.status": updatedSubscription.status,
        "plan.planStartDate": new Date(
          updatedSubscription.current_period_start * 1000
        ),
        "plan.planEndDate": new Date(
          updatedSubscription.current_period_end * 1000
        ),
      },
      { session }
    );

    await session.commitTransaction();

    return res.status(200).json({
      status: true,
      message: "Subscription updated successfully",
      data: {
        subscriptionId: updatedSubscription.id,
        status: updatedSubscription.status,
        currentPeriodEnd: new Date(
          updatedSubscription.current_period_end * 1000
        ),
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Subscription update error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Error updating subscription",
    });
  } finally {
    session.endSession();
  }
};

exports.retrieveUpcomingInvoice = async (req, res) => {
  try {
    const { planId } = req.query;
    const { userId } = req.user;

    // Find user and validate subscription
    const user = await User.findById(userId);
    const subscriptionId = user?.plan?.subscriptionId;

    if (!user?.plan?.subscriptionId) {
      return res.status(404).json({
        status: false,
        message: "No active subscription found",
      });
    }

    if (!planId) {
      return res.status(400).json({
        status: false,
        message: "PlanId ID are required",
      });
    }

    // Get premium plan details
    const plan = await premiumPlanModel.findById(planId);
    if (!plan) {
      return res.status(404).json({
        status: false,
        message: "Plan not found",
      });
    }

    const newPriceId = plan.productKey;

    // Retrieve current subscription
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Get upcoming invoice
    const invoice = await stripe.invoices.retrieveUpcoming({
      subscription_prorate: true,
      customer: user.plan.customerId,
      subscription: subscriptionId,
      subscription_items: [
        {
          id: subscription.items.data[0].id,
          deleted: true,
        },
        {
          price: newPriceId,
          deleted: false,
        },
      ],
    });

    return res.status(200).json({
      status: true,
      data: {
        amountDue: invoice.amount_due,
        amountRemaining: invoice.amount_remaining,
        currency: invoice.currency,
        periodStart: new Date(invoice.period_start * 1000),
        periodEnd: new Date(invoice.period_end * 1000),
        prorationDate: invoice?.proration_date
          ? new Date(invoice?.proration_date * 1000)
          : null,
        total: invoice.total,
        subtotal: invoice.subtotal,
      },
    });
  } catch (error) {
    console.error("Invoice retrieval error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Error retrieving upcoming invoice",
    });
  }
};

exports.cancelSubscription = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { cancelImmediately = false } = req.body;
    const { userId } = req.user;

    // Find user and validate subscription
    const user = await User.findById(userId);
    const subscriptionId = user.plan.subscriptionId;
    if (!user || !user.plan || !subscriptionId) {
      return res.status(404).json({
        status: false,
        message: "No active subscription found",
      });
    }

    // Get subscription from Stripe
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    if (!subscription) {
      return res.status(404).json({
        status: false,
        message: "Subscription not found in Stripe",
      });
    }

    let cancelledSubscription;
    if (cancelImmediately) {
      // Cancel immediately
      cancelledSubscription = await stripe.subscriptions.del(subscriptionId);
    } else {
      // Cancel at period end
      cancelledSubscription = await stripe.subscriptions.update(
        subscriptionId,
        {
          cancel_at_period_end: true,
        }
      );
    }

    // Update subscription history
    await premiumPlanHistoryModel.findOneAndUpdate(
      {
        userId: userId,
        transactionId: subscriptionId,
      },
      {
        status: "canceled",
        cancelledAt: new Date(),
      },
      { session }
    );

    await User.findByIdAndUpdate(
      userId,
      {
        "plan.status": "canceled",
      },
      { session }
    );

    await session.commitTransaction();

    return res.status(200).json({
      status: true,
      message: `Subscription cancelled successfully`,
      // cancelImmediately
      //   ? "Subscription cancelled successfully"
      //   : "Subscription will be cancelled at the end of the billing period",
      data: {
        subscriptionId: cancelledSubscription.id,
        status: cancelledSubscription.status,
        cancelAtPeriodEnd: cancelledSubscription.cancel_at_period_end,
        currentPeriodEnd: new Date(
          cancelledSubscription.current_period_end * 1000
        ),
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Subscription cancellation error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Error cancelling subscription",
    });
  } finally {
    session.endSession();
  }
};

exports.getStripeCustomerDetails = async (req, res) => {
  try {
    const { userId } = req.user;

    const user = await User.findById(userId);
    if (!user || !user?.plan?.customerId) {
      return res.status(404).json({
        status: false,
        message: "Stripe customer not found",
      });
    }

    const stripeCustomer = await getStripeCustomer(user?.plan?.customerId);

    return res.status(200).json({
      status: true,
      data: stripeCustomer,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error!!",
    });
  }
};

// Helper function to convert IP to integer
const ipToInt = (ip) => {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
};

const parseAdjustTimestamp = (timestamp) => {
  try {
    if (!timestamp) return null;

    // If timestamp is numeric we assume epoch (seconds or milliseconds)
    if (!isNaN(timestamp)) {
      const numericValue = Number(timestamp);
      if (Number.isFinite(numericValue)) {
        const millis =
          timestamp.toString().length === 10
            ? numericValue * 1000
            : numericValue;
        const dateObj = new Date(millis);
        return isNaN(dateObj.getTime()) ? null : dateObj;
      }
    }

    // Attempt to parse as ISO/string date
    const parsedDate = new Date(timestamp);
    return isNaN(parsedDate.getTime()) ? null : parsedDate;
  }
  catch (error) {
    console.error("Adjust timestamp parsing error:", error);
    return null;
  }
};

exports.handleAdjustWebhook = async (req, res) => {
  try {
    const {
      user_id,
      phone,
      event_name,
      tracker,
      city,
      country,
      country_subdivision,
      device_model,
      device_name,
      device_type,
      deeplink,
      language,
      os_name,
      os_version,
      postal_code,
      region,
      isp,
      adid,
      ip_address,
      nonce,
      app_version,
      device_manufacturer,
      tracker_name,
      first_tracker,
      campaign_name,
      adgroup_name,
      network_name,
      installed_at,
      gps_adid,
      web_uuid
    } = req.query;
    const parsedInstallDate = parseAdjustTimestamp(installed_at);
    const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0];

    // Adjust server IP allowlist Client IP value from console: ::ffff:169.254.129.1
    // const adjustIPRanges = [
    //   '23.19.48.0/22', '86.48.44.0/22', '173.208.60.0/23', '185.84.200.0/23',
    //   '185.129.40.0/22', '185.151.204.0/22', '185.230.36.0/22', '185.255.24.0/22',
    //   '195.244.54.0/24', '199.101.182.0/23'
    // ];

    // // Check if IP is from Adjust servers
    // const isValidIP = adjustIPRanges.some(range => {
    //   const [subnet, mask] = range.split('/');
    //   const subnetInt = ipToInt(subnet);
    //   const clientInt = ipToInt(clientIP);
    //   const maskInt = (0xFFFFFFFF << (32 - parseInt(mask))) >>> 0;
    //   return (clientInt & maskInt) === (subnetInt & maskInt);
    // });

    // if (!isValidIP) {
    //   console.log('adjust webhook - invalid IP:', clientIP);
    //   return res.status(403).json({
    //     status: false,
    //     message: "Request not from Adjust servers"
    //   });
    // }

    // Only process SIGN_UP and WEB_SIGN_UP events
    if (event_name !== 'SIGN_UP' && event_name !== 'WEB_SIGN_UP') {
      console.log('adjust webhook processing - event not sign up', event_name);
      return res.status(200).json({
        status: true,
        message: "Event ignored - only SIGN_UP/WEB_SIGN_UP events processed"
      });
    }

    if (!user_id || !tracker) {
      console.log('adjust webhook processing - no userId and tracker value')

      // Record webhook if we have user_id but missing tracker
      // if (user_id && !tracker) {
      //   try {
      //     await AdjustWebhookRecord.findOneAndUpdate(
      //       { userId: user_id },
      //       { userId: user_id, campaignName: campaign_name, networkName: network_name },
      //       { upsert: true }
      //     );
      //   } catch (error) {
      //     console.log('Error storing webhook record:', error.message);
      //   }
      // }

      return res.status(200).json({
        status: false,
        message: "user_id and tracker are required"
      });
    }

    // Validate ObjectId format - skip if invalid (test data)
    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      console.log('adjust webhook processing - invalid user_id', user_id)

      // Record webhook even with invalid user_id format
      // try {
      //   await AdjustWebhookRecord.findOneAndUpdate(
      //     { userId: user_id },
      //     { userId: user_id, tracker, campaignName: campaign_name, networkName: network_name },
      //     { upsert: true }
      //   );
      // } catch (error) {
      //   console.log('Error storing webhook record:', error.message);
      // }

      return res.status(200).json({
        status: true,
        message: "Invalid user_id format - skipped"
      });
    }

    const user = await User.findById(user_id);
    if (!user) {
      console.log('adjust webhook processing - user not found');

      // try {
      //   await AdjustWebhookRecord.findOneAndUpdate(
      //     { userId: user_id },
      //     { userId: user_id, phone, tracker, campaignName: campaign_name, networkName: network_name },
      //     { upsert: true }
      //   );
      // } catch (error) {
      //   console.log('Error storing webhook record:', error.message);
      // }

      return res.status(200).json({
        status: false,
        message: "User not found - webhook record stored"
      });
    }

    // Update campaignId with tracker value if it doesn't exist
    if (tracker && !user.adjustCampaignId) user.adjustCampaignId = tracker;
    // Save additional user details if they don't exist
    if (city && !user.city) user.city = city;
    if (postal_code && !user.postalCode) user.postalCode = postal_code;
    if (country_subdivision && !user.countrySubdivision) user.countrySubdivision = country_subdivision;
    if (device_manufacturer && !user.deviceManufacturer) user.deviceManufacturer = device_manufacturer;
    if (device_name && !user.deviceName) user.deviceName = device_name;
    if (isp && !user.isp) user.isp = isp;
    if (os_version && !user.osVersion) user.osVersion = os_version;
    if (campaign_name && !user.campaignName) user.campaignName = campaign_name;
    if (adgroup_name && !user.adgroupName) user.adgroupName = adgroup_name;
    if (network_name && !user.networkName) user.networkName = network_name;
    if (parsedInstallDate && !user.adjustInstalledAt) {
      user.adjustInstalledAt = parsedInstallDate;
    }
    if (ip_address && !user.ipAddress) user.ipAddress = ip_address;
    if (gps_adid) user.appAdvertisingId = gps_adid;
    if (web_uuid) user.adjustWebUUID = web_uuid;

    await user.save();

    // Prepare MoEngage user attributes with all available data
    const moEngageAttributes = {
      adjust_campaign_id: tracker
    };
    // Add device and location attributes if available
    if (city) moEngageAttributes.city = city;
    if (country) moEngageAttributes.country = country;
    if (country_subdivision) moEngageAttributes.country_subdivision = country_subdivision;
    if (device_model) moEngageAttributes.device_model = device_model;
    if (device_name) moEngageAttributes.device_name = device_name;
    if (device_type) moEngageAttributes.device_type = device_type;
    if (deeplink) moEngageAttributes.deeplink = deeplink;
    if (language) moEngageAttributes.language = language;
    if (os_name) moEngageAttributes.os_name = os_name;
    if (os_version) moEngageAttributes.os_version = os_version;
    if (postal_code) moEngageAttributes.postal_code = postal_code;
    if (region) moEngageAttributes.region = region;
    if (isp) moEngageAttributes.isp = isp;

    if (adid) moEngageAttributes.adid = adid
    if (ip_address) moEngageAttributes.ip_address = ip_address;
    if (nonce) moEngageAttributes.nonce = nonce;
    if (app_version) moEngageAttributes.app_version = app_version;
    if (device_manufacturer) moEngageAttributes.device_manufacturer = device_manufacturer;
    if (tracker_name) moEngageAttributes.tracker_name = tracker_name;
    if (first_tracker) moEngageAttributes.first_tracker = first_tracker;

    // Add device and location attributes if available
    if (city) moEngageAttributes.city = city;
    if (country) moEngageAttributes.country = country;
    if (country_subdivision) moEngageAttributes.country_subdivision = country_subdivision;
    if (device_model) moEngageAttributes.device_model = device_model;
    if (device_name) moEngageAttributes.device_name = device_name;
    if (device_type) moEngageAttributes.device_type = device_type;
    if (deeplink) moEngageAttributes.deeplink = deeplink;
    if (language) moEngageAttributes.language = language;
    if (os_name) moEngageAttributes.os_name = os_name;
    if (os_version) moEngageAttributes.os_version = os_version;
    if (postal_code) moEngageAttributes.postal_code = postal_code;
    if (region) moEngageAttributes.region = region;
    if (isp) moEngageAttributes.isp = isp;

    if (adid) moEngageAttributes.adid = adid
    if (ip_address) moEngageAttributes.ip_address = ip_address;
    if (nonce) moEngageAttributes.nonce = nonce;
    if (app_version) moEngageAttributes.app_version = app_version;
    if (device_manufacturer) moEngageAttributes.device_manufacturer = device_manufacturer;
    if (tracker_name) moEngageAttributes.tracker_name = tracker_name;
    if (first_tracker) moEngageAttributes.first_tracker = first_tracker;
    if (campaign_name) moEngageAttributes.campaign_name = campaign_name;
    if (campaign_name) moEngageAttributes.campaign_name_from = campaign_name;
    if (adgroup_name) moEngageAttributes.adgroup_name = adgroup_name;
    if (network_name) moEngageAttributes.network_name = network_name;
    if (parsedInstallDate) {
      moEngageAttributes.adjust_installed_at = parsedInstallDate.toISOString();
    }

    moengageTrackUser(user._id?.toString(), moEngageAttributes);

    return res.status(200).json({
      status: true,
      message: "Tracker updated successfully"
    });
  } catch (error) {
    console.error("Adjust webhook error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error"
    });
  }
};

exports.handleLinkRunnerWebhook = async (req, res) => {
  try {
    const { user_id, campaign_id } = req.body;
    const linkrunnerKey = req.headers["linkrunner-key"]
    console.log('linkrunner webhook processing', user_id, campaign_id)

    if (linkrunnerKey !== process.env.LINKRUNNER_KEY)
      return res.status(400).json({
        status: false,
        message: "Invalid linkrunner key"
      });

    if (!user_id || !campaign_id) {
      return res.status(400).json({
        status: false,
        message: "user_id and campaign_id are required"
      });
    }

    // Validate ObjectId format - skip if invalid (test data)
    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      return res.status(200).json({
        status: true,
        message: "Invalid user_id format - skipped"
      });
    }

    const user = await User.findById(user_id);
    if (!user) {
      console.log('linkrunner webhook processing - user not found')
      return res.status(404).json({
        status: false,
        message: "User not found"
      });
    }

    // Update campaignId if it doesn't exist
    if (!user.campaignId) {
      user.campaignId = campaign_id;
      await user.save();

      // Track user with MoEngage
      if (user_id && campaign_id) {
        moengageTrackUser(user_id, {
          linkrunner_campaign_id: campaign_id
        });
      }
    }

    return res.status(200).json({
      status: true,
      message: "Campaign ID updated successfully"
    });
  } catch (error) {
    console.error("LinkRunner webhook error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error"
    });
  }
};

exports.handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET
    );

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      switch (event.type) {
        case "customer.subscription.updated":
          await handleSubscriptionUpdated(event.data.object, session);
          break;
        case "invoice.payment_succeeded":
          await handleSuccessfulPayment(event.data.object, session);
          break;
        case "invoice.payment_failed":
          await handleFailedPayment(event.data.object, session);
          break;
        case "customer.subscription.deleted":
          await handleSubscriptionCancelled(event.data.object, session);
          break;
        default:
          console.log(`Unhandled event type ${event.type}`);
      }

      await session.commitTransaction();
      res.json({ received: true });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (err) {
    console.error("Webhook Error:", err.message);
    return res.status(400).json({
      status: false,
      message: `Webhook Error: ${err.message}`,
    });
  }
};

const handleSuccessfulPayment = async (invoice, session) => {
  try {
    const subscriptionHistory = await premiumPlanHistoryModel
      .findOne({
        transactionId: invoice.subscription,
      })
      .session(session);

    if (!subscriptionHistory) {
      throw new Error("Subscription history not found");
    }

    await premiumPlanHistoryModel.findByIdAndUpdate(
      subscriptionHistory._id,
      {
        status: "active",
        updatedAt: new Date(),
      },
      { session }
    );

    // Find and update user's plan
    const user = await User.findById(subscriptionHistory.userId).session(
      session
    );
    if (!user) {
      throw new Error("User not found");
    }

    // Calculate plan end date based on plan duration
    const planStartDate = new Date();
    const planEndDate = new Date();
    planEndDate.setDate(planEndDate.getDate() + 30);

    // Update user's plan details
    await User.findByIdAndUpdate(
      user._id,
      {
        plan: {
          status: "active",
          subscriptionId: invoice.subscription,
          customerId: invoice.customer,
          planStartDate: planStartDate,
          planEndDate: planEndDate,
        },
      },
      { session }
    );

    console.log(`Successfully updated subscription for user ${user._id}`);
  } catch (error) {
    console.error("Error in handleSuccessfulPayment:", error);
    throw error;
  }
};

const handleFailedPayment = async (invoice, session) => {
  try {
    await premiumPlanHistoryModel.findOneAndUpdate(
      { transactionId: invoice.subscription },
      {
        status: "failed",
      },
      { session }
    );

    // Update user's plan status
    const subscriptionHistory = await premiumPlanHistoryModel
      .findOne({ transactionId: invoice.subscription })
      .session(session);

    if (subscriptionHistory) {
      await User.findByIdAndUpdate(
        subscriptionHistory.userId,
        {
          "plan.status": "failed",
        },
        { session }
      );
    }

    console.log(`Payment failed for subscription ${invoice.subscription}`);
  } catch (error) {
    console.error("Error in handleFailedPayment:", error);
    throw error;
  }
};

const handleSubscriptionCancelled = async (subscription, session) => {
  try {
    await premiumPlanHistoryModel.findOneAndUpdate(
      { transactionId: subscription.id },
      {
        status: "canceled",
        cancelledAt: new Date(),
      },
      { session }
    );

    const subscriptionHistory = await premiumPlanHistoryModel
      .findOne({ transactionId: subscription.id })
      .session(session);

    if (subscriptionHistory) {
      await User.findByIdAndUpdate(
        subscriptionHistory.userId,
        {
          "plan.status": "canceled",
        },
        { session }
      );
    }

    console.log(`Subscription cancelled: ${subscription.id}`);
  } catch (error) {
    console.error("Error in handleSubscriptionCancelled:", error);
    throw error;
  }
};

const handleSubscriptionUpdated = async (subscription, session) => {
  try {
    const subscriptionHistory = await premiumPlanHistoryModel
      .findOne({
        transactionId: subscription.id,
      })
      .session(session);

    if (!subscriptionHistory) {
      throw new Error("Subscription history not found");
    }

    // Update subscription history with new status
    await premiumPlanHistoryModel.findByIdAndUpdate(
      subscriptionHistory._id,
      {
        status: subscription.status,
        updatedAt: new Date(),
      },
      { session }
    );

    // Update user's plan details
    await User.findByIdAndUpdate(
      subscriptionHistory.userId,
      {
        "plan.status": subscription.status,
        "plan.planStartDate": new Date(
          subscription.current_period_start * 1000
        ),
        "plan.planEndDate": new Date(subscription.current_period_end * 1000),
        "plan.cancelAtPeriodEnd": subscription.cancel_at_period_end,
      },
      { session }
    );

    // If subscription includes price/plan changes
    if (subscription.items && subscription.items.data.length > 0) {
      const newPriceId = subscription.items.data[0].price.id;
      // update the plan details based on the new price
    }


  } catch (error) {
    console.error("Error in handleSubscriptionUpdated:", error);
    throw error;
  }
};

exports.firebaseLogin = async (req, res) => {
  try {
    const origin = req.headers.origin || req.headers.referer || '';
    console.log(`Firebase Login Request Source - Origin/Referer: ${origin}, Platform: ${req.body.platform || 'Unknown'}`);
    // Extract just the hostname from the origin/referer URL (e.g. 'polite-pond-043ab9e00.azurestaticapps.net')
    let domain;
    try { if (origin) domain = new URL(origin).hostname; } catch (_) { }

    const { firebaseToken, deviceId, deviceInfo = {}, fcmToken, campaignId, adjustCampaignId, appInstanceId, appAdvertisingId, adjustWebUUID, platform, couponCode } = req.body;

    if (!firebaseToken) {
      return res.status(400).json({
        status: false,
        message: "Firebase token is required"
      });
    }

    if (!deviceId) {
      return res.status(400).json({
        status: false,
        message: "Device ID is required"
      });
    }

    // Verify Firebase token
    const admin = await require('../../util/privateKey');
    const decodedToken = await admin.auth().verifyIdToken(firebaseToken);

    if (!decodedToken) {
      return res.status(401).json({
        status: false,
        message: "Invalid Firebase token"
      });
    }

    // Extract user information from Firebase token
    let { uid, phone_number, email, name, picture } = decodedToken;
    // For some providers, name might not be directly available in the token
    // but can be extracted from email for Google/Apple users
    if (!name && email) {
      // Extract name from email prefix as fallback
      name = email.split('@')[0] || '';
    }

    // Get provider information from firebase.sign_in_provider
    const signInProvider = decodedToken?.firebase?.sign_in_provider;

    // Determine authentication provider
    const isGoogleAuth = signInProvider === 'google.com';
    const isPhoneAuth = signInProvider === 'phone';
    const isAppleAuth = signInProvider === 'apple.com';

    // Validate required fields based on provider
    if (isPhoneAuth && !phone_number) {
      return res.status(400).json({
        status: false,
        message: "Phone number not found in Firebase token"
      });
    }

    if ((isGoogleAuth || isAppleAuth) && !email) {
      return res.status(400).json({
        status: false,
        message: "Email not found in Google authentication token"
      });
    }

    // Check if user exists in our database
    let user;
    let isNewUser = false;

    // Always search by uniqueId (Firebase uid) first - this is the most reliable identifier
    user = await User.findOne({ uniqueId: uid }).select('+sessions');

    // If not found by uid, try email for Google auth (fallback for legacy accounts)
    if (!user && email) {
      user = await User.findOne({ email: email }).select('+sessions');
      // If found by email, update the uniqueId to link the accounts
      if (user && !user.uniqueId) {
        user.uniqueId = uid;
      }
    }

    // If not found by uid, try phone number for phone auth (fallback for legacy accounts)
    if (!user && isPhoneAuth && phone_number) {
      user = await User.findOne({ phoneNumber: phone_number }).select('+sessions');
      // If found by phone, update the uniqueId to link the accounts
      if (user && !user.uniqueId) {
        user.uniqueId = uid;
      }
    }

    // If still not found, check by deviceId for device-based records (guest users, etc.)
    // and this will mainly work now for email bases google and apple login for phone that will handled in verify
    if (!user) {
      user = await User.findOne({
        'sessions.deviceId': deviceId,
        // Must not have any authentication credentials (all three must be null/missing)
        $and: [
          {
            $or: [
              { uniqueId: null },
              { uniqueId: "" },
              { uniqueId: { $exists: false } }
            ]
          },
          {
            $or: [
              { email: null },
              { email: { $exists: false } }
            ]
          },
          {
            $or: [
              { phoneNumber: null },
              { phoneNumber: { $exists: false } }
            ]
          }
        ]
      }).select('+sessions');
      // consider this as new user as well!
      if (user)
        isNewUser = true;
    }

    if (!user) {
      // Create new user
      isNewUser = true;
      const userData = {
        uniqueId: uid,
        loginType: isPhoneAuth ? 0 : (isGoogleAuth ? 1 : (isAppleAuth ? 2 : 0)), // 0=phone, 1=google, 2=Apple, 3=guest
        date: new Date().toLocaleString("en-US"),
        phoneStatus: "VERIFIED" // Since Firebase has already verified
      };

      // Add provider-specific data
      if (isPhoneAuth && phone_number) {
        userData.phoneNumber = phone_number;
      }

      if ((isGoogleAuth || isAppleAuth) && email) {
        userData.email = email;
      }

      if (name) {
        userData.fullName = name;
      }

      if (picture) {
        userData.image = picture;
      }

      // Add fcmToken if provided
      if (fcmToken) {
        userData.fcmToken = fcmToken;
      }

      // Add campaignId if provided
      if (campaignId) {
        userData.campaignId = campaignId;
      }

      if (adjustCampaignId) {
        userData.adjustCampaignId = adjustCampaignId;
      }
      // Add appInstanceId if provided
      if (appInstanceId) {
        userData.appInstanceId = appInstanceId;
      }

      // Add appAdvertisingId if provided
      if (appAdvertisingId) {
        userData.appAdvertisingId = appAdvertisingId;
      }

      // Add adjustWebUUID if provided
      if (adjustWebUUID) {
        userData.adjustWebUUID = adjustWebUUID;
      }

      // Add platform if provided
      if (platform) {
        userData.platform = platform;
      }

      // Capture signup domain from origin/referer header — set once at account creation
      if (domain) {
        userData.domain = domain;
      }

      user = new User(userData);

      // Track campaigns after user creation (so user._id exists)
      if (campaignId && user?._id) {
        moengageTrackUser(user?._id?.toString(), {
          linkrunner_campaign_id: campaignId
        });
      }

      if (adjustCampaignId && user?._id) {
        moengageTrackUser(user?._id?.toString(), {
          adjust_campaign_id: adjustCampaignId
        });
      }
    } else {

      // Update phone status if not set or verified
      if (!user.phoneStatus || user.phoneStatus !== 'VERIFIED') {
        user.phoneStatus = "VERIFIED";

        //Also this is as new user
        isNewUser = true;
      }

      // Update core Firebase information
      if (!user.uniqueId && uid) {
        user.uniqueId = uid;
      }

      // If user was found by phone but doesn't have email, add it
      if ((isGoogleAuth || isAppleAuth) && email && !user.email) {
        user.email = email;
      }

      // If user was found by email but doesn't have phone number, add it
      if (isPhoneAuth && phone_number && !user.phoneNumber) {
        user.phoneNumber = phone_number;
      }

      // Update login type if it's different (upgrade from guest to authenticated)
      const expectedLoginType = isPhoneAuth ? 0 : (isGoogleAuth ? 1 : (isAppleAuth ? 2 : 0)); // 0=phone, 1=google, 2=Apple, 3=guest
      if (user.loginType !== expectedLoginType) {
        user.loginType = expectedLoginType;
      }

      if (name && !user.fullName) {
        user.fullName = name;
      }

      if (picture && !user.image) {
        user.image = picture;
      }

      // Update fcmToken if provided
      if (fcmToken && user.fcmToken !== fcmToken) {
        user.fcmToken = fcmToken;
      }

      // Update campaignId if provided and user doesn't have one
      if (campaignId && !user.campaignId) {
        user.campaignId = campaignId;
        moengageTrackUser(user._id.toString(), {
          linkrunner_campaign_id: campaignId
        });
      }
      if (adjustCampaignId && !user.adjustCampaignId) {
        user.adjustCampaignId = adjustCampaignId;
        moengageTrackUser(user._id?.toString(), {
          adjust_campaign_id: adjustCampaignId
        });
      }

      // Update appInstanceId if provided
      if (appInstanceId && user.appInstanceId !== appInstanceId) {
        user.appInstanceId = appInstanceId;
      }

      // Update appAdvertisingId if provided
      if (appAdvertisingId && user.appAdvertisingId !== appAdvertisingId) {
        user.appAdvertisingId = appAdvertisingId;
      }

      // Update adjustWebUUID if provided
      if (adjustWebUUID && user.adjustWebUUID !== adjustWebUUID) {
        user.adjustWebUUID = adjustWebUUID;
      }

      // Update platform if provided and not already set
      if (platform && !user.platform) {
        user.platform = platform;
      }

    }

    // Initialize sessions array if it doesn't exist
    if (!user.sessions) {
      user.sessions = [];
    }

    // Deactivate all existing sessions (instead of deleting them)
    user.sessions.forEach(session => {
      session.isActive = false;
      session.lastUsed = new Date();
    });

    // Create or update session for current device
    const session = {
      deviceId,
      accessToken: null, // Not needed for Firebase
      refreshToken: null,  // Set to null since not needed for Firebase
      isActive: true, // Only current device is active
      lastUsed: new Date(),
      deviceInfo
    };

    // Update or add current device session
    const existingSessionIndex = user.sessions.findIndex(s => s.deviceId === deviceId);
    if (existingSessionIndex >= 0) {
      // Update existing session for this device
      user.sessions[existingSessionIndex] = session;
    } else {
      // Add new session for this device
      user.sessions.push(session);
    }

    await user.save();

    // Verify coupon if couponCode provided (same as validate/apply flow) and map to response shape
    let coupon = null;
    if (couponCode && String(couponCode).trim()) {
      try {
        const result = await couponService.applyCoupon(user._id.toString(), String(couponCode).trim().toUpperCase());
        if (result.success) {
          coupon = {
            valid: true,
            message: "Coupon is valid",
            code: "COUPON_VALID",
            coupon_code: result.coupon.couponCode,
            source: result.coupon.campaignSource,
            campaign: result.coupon.campaignName,
          };
        } else {
          const err = result.error || {};
          coupon = { valid: false, message: err.message || "Coupon not applicable", code: err.code || "COUPON_ERROR" };
        }
      } catch (err) {
        console.error("Firebase login coupon validation error:", err?.message);
        coupon = { valid: false, message: err?.message || "Coupon validation failed", code: "COUPON_VALIDATION_ERROR" };
      }
    }

    // Send Adjust signup event for new users
    if (isNewUser && user.platform === 'web' && process.env.NODE_ENV === 'production') {
      const adjustEventData = {
        adjustWebUUID: user.adjustWebUUID,
        platform: user.platform,
        domain: user.domain
      };

      // Add callback parameters with user data (only non-empty values)
      const callbackParams = {
        user_id: user._id.toString(),
        login_type: user.loginType.toString()
      };

      if (user.phoneNumber) callbackParams.phone_number = user.phoneNumber;
      if (user.email) callbackParams.email = user.email;
      if (user.fullName) callbackParams.full_name = user.fullName;
      if (user.campaignId) callbackParams.campaign_id = user.campaignId;
      if (user.adjustCampaignId) callbackParams.adjust_campaign_id = user.adjustCampaignId;

      adjustEventData.callback_params = JSON.stringify(callbackParams);

      captureWebSignUpEvent(user._id.toString(), adjustEventData)
        .catch(err => console.error('Adjust signup event error:', err));

      // Send MoEngage signup event
      sendPlatformEventToMoEngage(user._id.toString(), 'signUp', {
        ...callbackParams,
        platform: user.platform
      }).catch(err => console.error('MoEngage signup event error:', err));
    }

    return res.json({
      status: true,
      message: isNewUser ? "Registration successful" : "Login successful",
      data: {
        _id: user._id,
        phoneNumber: user.phoneNumber,
        email: user.email,
        fullName: user.fullName,
        image: user.image,
        campaignId: user.campaignId,
        appInstanceId: user.appInstanceId,
        isPremiumPlan: user.isPremiumPlan,
        plan: user.plan,
        freeTrial: user.freeTrial,
        isNewUser,
        coupon,
      }
    });
  } catch (error) {
    console.error("Firebase login error:", error);

    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        status: false,
        message: "Firebase token has expired"
      });
    }

    if (error.code === 'auth/argument-error' || error.code === 'auth/invalid-id-token') {
      return res.status(401).json({
        status: false,
        message: "Invalid Firebase token"
      });
    }

    return res.status(500).json({
      status: false,
      message: "Error processing request",
      error: error.message
    });
  }
};

// Send Phone OTP using MSG91
exports.sendPhoneOTP = async (req, res) => {
  try {
    const { platform } = req.body;

    // Validate and normalize phone number
    const validation = validateAndNormalizePhone(req.body.phoneNumber);
    if (!validation.isValid) {
      return res.status(400).json({
        status: false,
        message: validation.error
      });
    }

    const phoneNumber = validation.phoneNumber;

    // Validate phone number using MSG91 service
    const msg91Validation = msg91Service.validatePhoneNumber(phoneNumber);
    if (!msg91Validation.isValid) {
      return res.status(400).json({
        status: false,
        message: msg91Validation.error
      });
    }

    // Check if user exists with this phone number (only phone login type)
    let user = await User.findOne({
      phoneNumber: phoneNumber,
      loginType: 0 // Phone login type only
    }).select('+sessions');

    // If not found by phone, check by deviceId for device-based records (guest users, etc.)
    // Only find pure guest users who have NONE of: uniqueId, phoneNumber, or email
    if (!user && (req.body.deviceId || req.headers['device-id'])) {
      user = await User.findOne({
        'sessions.deviceId': req.body.deviceId || req.headers['device-id'],
        // Must not have any authentication credentials (all three must be null/missing)
        $and: [
          {
            $or: [
              { uniqueId: null },
              { uniqueId: "" },
              { uniqueId: { $exists: false } }
            ]
          },
          {
            $or: [
              { phoneNumber: null },
              { phoneNumber: { $exists: false } }
            ]
          },
          {
            $or: [
              { email: null },
              { email: { $exists: false } }
            ]
          }
        ]
      }).select('+sessions');

      if (user && !user.phoneNumber && user.loginType === 3) {
        // Update existing device-based guest user with phone number, login type to assign existing record
        user.phoneNumber = phoneNumber;
        user.loginType = 0;

        await user.save();
      }
    }

    if (!user) {
      // New user - create unverified record (no OTP stored, MSG91 handles it)
      user = await User.create({
        phoneNumber: phoneNumber,
        phoneStatus: "UNVERIFIED",
        loginType: 0, // Phone login type
        platform: platform || 'android'
      });
    }

    // Send OTP using MSG91's official API (MSG91 generates and manages OTP)
    try {
      const origin = req.headers.origin || req.headers.referer || '';
      await msg91Service.sendOTP(phoneNumber, { platform, origin });
      console.log('MSG91 OTP send successful', phoneNumber, user?._id)
      return res.json({
        status: true,
        message: "OTP sent successfully",
        data: {
          phoneNumber: phoneNumber,
          isNewUser: user.phoneStatus === 'VERIFIED' ? false : true,
          expiresIn: 600 // seconds
        }
      });
    } catch (smsError) {
      console.error('MSG91 OTP sending failed:', smsError);

      return res.status(500).json({
        status: false,
        message: "Failed to send OTP",
        error: smsError.message
      });
    }

  } catch (error) {
    console.error("Send Phone OTP error:", error);
    return res.status(500).json({
      status: false,
      message: "Error processing request",
      error: error.message
    });
  }
};

// Verify Phone OTP and generate Firebase custom token
exports.verifyPhoneOTP = async (req, res) => {
  try {
    const origin = req.headers.origin || req.headers.referer || '';
    console.log(`Verify Phone OTP Request Source - Origin/Referer: ${origin}, Platform: ${req.body.platform || 'Unknown'}`);
    // Extract just the hostname from the origin/referer URL
    let domain;
    try { if (origin) domain = new URL(origin).hostname; } catch (_) { }

    const { otp, deviceId, deviceInfo = {}, fcmToken, campaignId, adjustCampaignId, appInstanceId, appAdvertisingId, adjustWebUUID, platform } = req.body;

    if (!otp || !deviceId) {
      return res.status(400).json({
        status: false,
        message: "Phone number, OTP, and Device ID are required"
      });
    }

    // Validate and normalize phone number
    const validation = validateAndNormalizePhone(req.body.phoneNumber);
    if (!validation.isValid) {
      return res.status(400).json({
        status: false,
        message: validation.error
      });
    }

    const phoneNumber = validation.phoneNumber;

    // Find user (don't check OTP in database, MSG91 handles verification)
    let user = await User.findOne({
      phoneNumber: phoneNumber,
      loginType: 0 // Phone login type only
    }).select('+sessions');


    // If not found by phone and login type 0, It can be recently updated it's number from last guest login record
    if (!user) {
      user = await User.findOne({
        phoneNumber: phoneNumber,
        loginType: 3 // Phone login type only
      }).select('+sessions');
    }

    if (!user) {
      console.log("User not found. Please send OTP first.", req.body, user ? JSON.stringify(user) : "")
      return res.status(400).json({
        status: false,
        message: "User not found. Please send OTP first."
      });
    }

    // Verify OTP with MSG91's official API
    try {
      const verification = await msg91Service.verifyOTP(phoneNumber, otp);

      if (!verification.isValid) {
        // Check for max limit reached error
        if (verification.error && verification.error.toLowerCase().includes('max limit reached')) {
          return res.status(429).json({
            status: false,
            message: "Max limit reached for this OTP verification. Please request a new OTP or try again later.",
            code: "OTP_VERIFY_LIMIT_REACHED"
          });
        }

        return res.status(400).json({
          status: false,
          message: verification.error || "Invalid or expired OTP",
          details: verification.response
        });
      }

      // Check if the message indicates the number is already verified
      const alreadyVerified = verification.response &&
        verification.response.message &&
        verification.response.message.toLowerCase().includes('already verified');

      if (alreadyVerified) {
        console.log("Phone number already verified with MSG91, continuing login flow");
      } else {
        console.log("MSG91 verification successful:", phoneNumber, verification);
      }
    } catch (verifyError) {
      console.error('MSG91 OTP verification failed:', verifyError);

      if (verifyError.message && verifyError.message.toLowerCase().includes('max limit reached')) {
        return res.status(429).json({
          status: false,
          message: "Max limit reached for this OTP verification. Please request a new OTP or try again later.",
          code: "OTP_VERIFY_LIMIT_REACHED"
        });
      }

      return res.status(400).json({
        status: false,
        message: "OTP verification failed: " + (verifyError.message || "Unknown error"),
        error: verifyError
      });
    }

    // Capture isNewUser status BEFORE updating phoneStatus
    const isNewUser = user.phoneStatus === "UNVERIFIED"

    // We con't make her verified because it's will done, when after this process user from app will do firebase login
    // if (user.phoneStatus === "UNVERIFIED") {
    //   user.phoneStatus = "VERIFIED";
    // }

    // If this was a device-based user, update with phone number
    if (!user.phoneNumber) {
      user.phoneNumber = phoneNumber;
    }

    if (!user.loginType !== 0)
      user.loginType = 0; // Phone login type

    // Set unique ID if not exists (for Firebase custom token)
    if (!user.uniqueId) {
      user.uniqueId = user._id.toString(); // Use MongoDB ObjectId as unique identifier
    }

    // Update fcmToken if provided
    if (fcmToken && user.fcmToken !== fcmToken) {
      user.fcmToken = fcmToken;
    }

    // Update campaignId if provided and user doesn't have one
    if (campaignId && !user.campaignId) {
      user.campaignId = campaignId;
      moengageTrackUser(user._id.toString(), {
        linkrunner_campaign_id: campaignId
      });
    }
    if (adjustCampaignId && !user.adjustCampaignId) {
      user.adjustCampaignId = adjustCampaignId;
      moengageTrackUser(user._id?.toString(), {
        adjust_campaign_id: adjustCampaignId
      });
    }

    // Update appInstanceId if provided
    if (appInstanceId && user.appInstanceId !== appInstanceId) {
      user.appInstanceId = appInstanceId;
    }

    // Update appAdvertisingId if provided
    if (appAdvertisingId && user.appAdvertisingId !== appAdvertisingId) {
      user.appAdvertisingId = appAdvertisingId;
    }

    // Update adjustWebUUID if provided
    if (adjustWebUUID && user.adjustWebUUID !== adjustWebUUID) {
      user.adjustWebUUID = adjustWebUUID;
    }

    // Update platform if provided and not already set
    if (platform && !user.platform) {
      user.platform = platform;
    }

    // Set domain only once — only during signup (isNewUser), from origin/referer header
    if (isNewUser && domain && !user.domain) {
      user.domain = domain;
    }

    // Initialize sessions array if it doesn't exist
    if (!user.sessions) {
      user.sessions = [];
    }

    // Deactivate all existing sessions (instead of deleting them)
    user.sessions.forEach(session => {
      session.isActive = false;
      session.lastUsed = new Date();
    });

    // Create or update session for current device
    const session = {
      deviceId,
      accessToken: null, // Not needed for Firebase
      refreshToken: null, // Set to null since not needed for Firebase
      isActive: true, // Only current device is active
      lastUsed: new Date(),
      deviceInfo
    };

    // Update or add current device session
    const existingSessionIndex = user.sessions.findIndex(s => s.deviceId === deviceId);
    if (existingSessionIndex >= 0) {
      // Update existing session for this device
      user.sessions[existingSessionIndex] = session;
    } else {
      // Add new session for this device
      user.sessions.push(session);
    }

    await user.save();

    // Generate Firebase custom token
    try {
      const admin = await require('../../util/privateKey');

      // Create custom claims for the token
      const customClaims = {
        phone_number: phoneNumber,
        loginType: 0, // Phone login type
        userId: user._id.toString(),
        phoneVerified: true
      };

      // Generate Firebase custom token
      const customToken = await admin.auth().createCustomToken(user.uniqueId, customClaims);

      // Return same response format as firebaseLogin

      return res.json({
        status: true,
        message: isNewUser ? "Registration successful" : "Login successful",
        data: {
          _id: user._id,
          phoneNumber: user.phoneNumber,
          email: user.email,
          fullName: user.fullName,
          image: user.image,
          campaignId: user.campaignId,
          isPremiumPlan: user.isPremiumPlan,
          paymentProviderFreeTrialConsumed: user.paymentProviderFreeTrialConsumed || false,
          plan: user.plan,
          freeTrial: user.freeTrial,
          isNewUser,
          customToken: customToken // Add custom token to response
        }
      });

    } catch (firebaseError) {
      console.error("Firebase custom token generation error:", firebaseError);
      return res.status(500).json({
        status: false,
        message: "Error generating authentication token",
        error: firebaseError.message
      });
    }

  } catch (error) {
    console.error("Verify Phone OTP error:", error);
    return res.status(500).json({
      status: false,
      message: "Error processing request",
      error: error.message
    });
  }
};

// Resend Phone OTP
exports.resendPhoneOTP = async (req, res) => {
  try {
    // Validate and normalize phone number
    const validation = validateAndNormalizePhone(req.body.phoneNumber);
    if (!validation.isValid) {
      return res.status(400).json({
        status: false,
        message: validation.error
      });
    }

    const phoneNumber = validation.phoneNumber;

    // Check if user exists
    const user = await User.findOne({
      phoneNumber: phoneNumber,
      loginType: 0 // Phone login type only
    });

    if (!user) {
      return res.status(400).json({
        status: false,
        message: "User not found. Please send OTP first."
      });
    }

    await msg91Service.resendOTP(phoneNumber);

    return res.json({
      status: true,
      message: "OTP resent successfully",
      data: {
        phoneNumber: phoneNumber,
        expiresIn: 600 // seconds
      }
    });

  } catch (error) {
    console.error("Resend Phone OTP error:", error);

    // Check if error is due to MSG91 retry limit
    if (error.message && error.message.toLowerCase().includes('maxed out')) {
      return res.status(429).json({
        status: false,
        message: "You've reached the maximum resend attempts. Please try again later or contact support.",
        code: "OTP_RETRY_LIMIT_REACHED"
      });
    }

    // Check if error is due to OTP already verified
    if (error.message && error.message.toLowerCase().includes('already verified')) {
      return res.status(400).json({
        status: false,
        message: "This number is already verified. Please proceed with verification or login.",
        code: "OTP_ALREADY_VERIFIED"
      });
    }

    return res.status(500).json({
      status: false,
      message: "Failed to resend OTP",
      error: error.message
    });
  }
};

// Check free trial status and device usage
exports.checkFreeTrial = async (req, res) => {
  try {
    const deviceId = req.headers['device-id'];

    if (!deviceId) {
      return res.status(400).json({
        status: false,
        message: "Device ID is required in headers"
      });
    }

    // Check if device has a user entry - prioritize premium users first
    const user = await User.findOne({
      'sessions.deviceId': deviceId
    }).sort({ isPremiumPlan: -1 });

    // Get settings from global settings JSON
    const settings = global.settingJSON;

    const maxEpisodeLimit = settings?.anonymousEpisodeWatchLimit || 5;

    const response = {
      deviceId: deviceId,
      freeTrialEnabled: settings?.isFreeTrialEnabled || false,
      maxEpisodeLimit: maxEpisodeLimit,
    };

    if (user) {
      // Check if user is blocked
      if (user.isBlock) {
        return res.status(500).json({
          status: false,
          message: "Your account has been blocked by admin!",
          ...response,
          isBlocked: true
        });
      }

      // Check if user has a real account (not guest)
      if (user.loginType !== 3) {
        response.hasExistingAccount = true
        response.loginType = user.loginType
        response.phoneNumber = user.phoneNumber || null
        response.email = user.email || null
        response.isPremiumPlan = user.isPremiumPlan || false
        response.userId = user._id || null
        response.canStartFreeTrial = false;
        response.message = "An account already exists with this device. Please login to continue.";
      }

      // Check free trial status only for guest users (loginType 3)
      if (user.loginType === 3 && user.freeTrial && user.freeTrial.isActive) {
        response.freeTrial = user.freeTrial;
        response.canStartFreeTrial = false;
        response.watchedCount = user.freeTrial.watchedCount;
        response.message = "Free trial is active. You can continue watching.";
      } else if (user.loginType === 3) {
        // Guest user without active free trial
        response.canStartFreeTrial = response.freeTrialEnabled;
        response.message = response.freeTrialEnabled ?
          "You can start a free trial to watch more content." :
          "Free trial is currently disabled. Please login or subscribe to continue.";
      }
    } else {

      // Count unique episodes viewed by this device
      const uniqueEpisodesCount = await ViewedContent.aggregate([
        { $match: { deviceId: deviceId } },
        { $group: { _id: "$episodeId" } },
        { $count: "uniqueEpisodes" }
      ]);
      const watchedCount = uniqueEpisodesCount[0]?.uniqueEpisodes || 0;
      const hasReachedEpisodeLimit = watchedCount >= maxEpisodeLimit;
      // No user found - check episode limit and free trial availability
      response.watchedCount = watchedCount;
      response.canStartFreeTrial = !hasReachedEpisodeLimit && response.freeTrialEnabled;
      response.message = hasReachedEpisodeLimit ?
        "You have reached the maximum episode watch limit. Please login or subscribe to continue." :
        "You can start a free trial to watch more content.";
    }

    return res.status(200).json({
      status: true,
      message: "Device check completed",
      ...response
    });

  } catch (error) {
    console.error('Error in checkFreeTrial:', error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

// Start free trial for device or user
exports.startFreeTrial = async (req, res) => {
  try {
    const deviceId = req.headers['device-id'];
    const userId = req.user?.userId; // From optional auth middleware

    if (!deviceId && !userId) {
      return res.status(400).json({
        status: false,
        message: "Device ID or user authentication is required"
      });
    }

    // Get settings from global settings JSON
    const settings = global.settingJSON;

    if (!settings || !settings.isFreeTrialEnabled) {
      return res.status(200).json({
        status: false,
        message: "Free trial is currently disabled",
        freeTrialDisabled: true
      });
    }

    let user = null;
    let isExistingUser = false;

    // Check if we have a logged in user
    if (userId) {
      user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          status: false,
          message: "User not found"
        });
      }

      isExistingUser = true;

    } else {
      // Check if device already has a user
      user = await User.findOne({
        'sessions.deviceId': deviceId,
        loginType: 3
      });

      if (user)
        isExistingUser = true;

    }

    // Count unique episodes viewed
    let watchedCount = 0;
    if (isExistingUser) {
      // For logged in user, use free trial watched count or 0
      watchedCount = user?.freeTrial?.watchedCount || 0;
    } else {
      // For device-based, count from ViewedContent
      const uniqueEpisodesCount = await ViewedContent.aggregate([
        { $match: { deviceId: deviceId } },
        { $group: { _id: "$episodeId" } },
        { $count: "uniqueEpisodes" }
      ]);
      watchedCount = uniqueEpisodesCount[0]?.uniqueEpisodes || 0;
    }

    const maxEpisodeLimit = settings?.anonymousEpisodeWatchLimit || 5;
    const hasReachedEpisodeLimit = watchedCount >= maxEpisodeLimit;

    if (hasReachedEpisodeLimit) {
      return res.status(200).json({
        status: false,
        message: "You have reached the maximum episode watch limit. Please subscribe to continue.",
        hasReachedEpisodeLimit: true,
        watchedCount: watchedCount,
        maxEpisodeLimit: maxEpisodeLimit
      });
    }

    // Check if user already has active free trial
    if (isExistingUser && user?.freeTrial && user?.freeTrial?.isActive) {
      return res.status(200).json({
        status: false,
        message: "Free trial is already active",
        freeTrialActive: true,
        freeTrial: user?.freeTrial
      });
    }

    if (isExistingUser) {
      // Update existing user's free trial
      user.freeTrial = {
        isActive: true,
        startAt: new Date(),
        watchedCount: watchedCount
      };
      await user.save();

      return res.status(200).json({
        status: true,
        message: "Free trial started successfully",
        user: {
          _id: user._id,
          loginType: user.loginType,
          freeTrial: user.freeTrial,
          updatedAt: user.updatedAt
        }
      });
    } else {
      // Create new guest user with free trial
      const guestUser = new User({
        loginType: 3, // guest login type
        freeTrial: {
          isActive: true,
          startAt: new Date(),
          watchedCount: watchedCount
        }
      });

      // Create session for the device (similar to firebase login)
      const session = {
        deviceId,
        accessToken: null, // Not needed for guest users
        refreshToken: null, // Not needed for guest users
        isActive: true,
        lastUsed: new Date(),
        deviceInfo: {
          deviceName: req.headers['user-agent'] || 'Unknown',
          deviceType: 'mobile',
          browserInfo: req.headers['user-agent'] || 'Unknown'
        }
      };

      // Add session to user
      guestUser.sessions = [session];

      await guestUser.save();

      return res.status(200).json({
        status: true,
        message: "Free trial started successfully",
        user: {
          _id: guestUser._id,
          loginType: guestUser.loginType,
          freeTrial: guestUser.freeTrial,
          createdAt: guestUser.createdAt
        }
      });
    }

  } catch (error) {
    console.error('Error in startFreeTrial:', error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

// Check if device exists or create guest user
exports.checkOrCreateDevice = async (req, res) => {
  try {
    const deviceId = req.headers['device-id'];
    const { campaignId } = req.body; // Optional campaign ID from request body
    console.log('processing check device- campaign track data', campaignId, deviceId)

    if (!deviceId) {
      return res.status(400).json({
        status: false,
        message: "Device ID is required in headers"
      });
    }

    // Check if device already has a user entry
    const existingUser = await User.findOne({
      'sessions.deviceId': deviceId
    });

    if (existingUser) {
      // Device exists, return user information
      console.log('processing check device- device already exists', deviceId)
      return res.status(400).json({
        status: false,
        message: "Device already exists",
        exists: true,
      });
    } else {
      // Device doesn't exist, create new guest user
      const guestUserData = {
        loginType: 3, // Guest login type
        freeTrial: {
          isActive: false,
          watchedCount: 0
        }
      };

      // Add campaignId if provided
      if (campaignId) {
        guestUserData.campaignId = campaignId;
      }

      const guestUser = new User(guestUserData);

      // Create session for the device
      const session = {
        deviceId: deviceId,
        accessToken: null, // Not needed for guest users
        refreshToken: null, // Not needed for guest users
        isActive: true,
        lastUsed: new Date(),
        deviceInfo: {
          deviceName: req.headers['user-agent'] || 'Unknown Device',
          deviceType: 'mobile', // Default to mobile
          browserInfo: req.headers['user-agent'] || 'Unknown Browser'
        }
      };

      // Add session to user
      guestUser.sessions = [session];

      // Save the guest user
      await guestUser.save();

      console.log('processing check device- guest user created with campaign', deviceId, campaignId)
      return res.status(201).json({
        status: true,
        message: "Guest user created successfully",
        exists: false,
        user: {
          _id: guestUser._id,
          loginType: guestUser.loginType,
          campaignId: guestUser.campaignId,
          createdAt: guestUser.createdAt,
          updatedAt: guestUser.updatedAt,
          freeTrial: guestUser.freeTrial,
        }
      });
    }

  } catch (error) {
    console.error('Error in processing check device:', error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};

// Flush Redis cache for admin
exports.flushRedis = async (req, res) => {
  try {
    await redisClient.FLUSHDB('ASYNC');
    return res.status(200).json({
      status: true,
      message: "Redis cache cleared successfully"
    });
  } catch (error) {
    console.error('Error flushing Redis:', error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error"
    });
  }
};
exports.getAttributedUsers = async (req, res) => {
  try {

    const { display_id, start_timestamp, end_timestamp, timezone, page = 1, limit = 50 } = req.query;

    if (!display_id) {
      return res.status(400).json({
        status: false,
        message: 'display_id is required'
      });
    }

    const options = {};
    if (start_timestamp) options.start_timestamp = start_timestamp;
    if (end_timestamp) options.end_timestamp = end_timestamp;
    if (timezone) options.timezone = timezone;
    if (page) options.page = parseInt(page);
    if (limit) options.limit = parseInt(limit);

    const result = await getAttributedUsers(display_id, options);

    return res.status(200).json({
      status: true,
      message: 'Attributed users retrieved successfully',
      data: result
    });
  } catch (error) {
    console.error('Get attributed users error:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to retrieve attributed users',
      error: error.message
    });
  }
};

exports.capturePaymentEvent = async (req, res) => {
  try {

    const { userId, paymentId, amount, type = 'DEFAULT', status = 'PAYMENT_COMPLETED', planType } = req.body;

    if (!userId || !paymentId || !amount) {
      return res.status(400).json({
        status: false,
        message: 'userId, paymentId, and amount are required'
      });
    }

    // Validate payment type
    const validTypes = ['SUBSCRIPTION_RENEWED', 'DEFAULT'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        status: false,
        message: `Invalid payment type. Valid types: ${validTypes.join(', ')}`
      });
    }

    // Capture default payment event
    const result = await capturePayment(userId, paymentId, amount, type, status);


    return res.status(200).json({
      status: true,
      message: 'Payment event captured successfully',
      data: result
    });
  } catch (error) {
    console.error('Capture payment event error:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to capture payment event',
      error: error.message
    });
  }
};

exports.captureEventAPI = async (req, res) => {
  try {

    const { event_name, user_id, event_data = {} } = req.body;

    if (!event_name || !user_id) {
      return res.status(400).json({
        status: false,
        message: 'event_name and user_id are required'
      });
    }

    // Validate payment type
    const validTypes = ['3_MONTH_PLAN_REVENUE', '1_YEAR_PLAN_REVENUE'];
    if (!validTypes.includes(event_name)) {
      return res.status(400).json({
        status: false,
        message: `Invalid payment type. Valid types: ${validTypes.join(', ')}`
      });
    }
    const result = await captureEvent(event_name, user_id, event_data);

    return res.status(200).json({
      status: true,
      message: 'Event captured successfully',
      data: result
    });
  } catch (error) {
    console.error('Capture event error:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to capture event',
      error: error.message
    });
  }
};

exports.testGA4Purchase = async (req, res) => {
  try {
    const { userId, paymentId, amount, currency = 'INR' } = req.body;

    if (!userId || !paymentId || !amount) {
      return res.status(400).json({
        status: false,
        message: 'userId, paymentId, and amount are required'
      });
    }

    const result = await trackGA4SubscriptionRenewed(userId, paymentId, amount, currency);

    return res.status(200).json({
      status: true,
      message: 'GA4 SUBSCRIPTION_RENEWED event sent successfully',
      data: { sent: result }
    });
  } catch (error) {
    console.error('Test GA4 subscription renewed error:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to send GA4 SUBSCRIPTION_RENEWED event',
      error: error.message
    });
  }
};

exports.testGA4Subscription = async (req, res) => {
  try {
    const { userId, eventName, amount, paymentId } = req.body;

    if (!userId || !eventName || !amount || !paymentId) {
      return res.status(400).json({
        status: false,
        message: 'userId, eventName, amount, and paymentId are required'
      });
    }

    if (!['THREE_MONTH_PLAN_REVENUE', 'ONE_YEAR_PLAN_REVENUE'].includes(eventName)) {
      return res.status(400).json({
        status: false,
        message: 'eventName must be THREE_MONTH_PLAN_REVENUE or ONE_YEAR_PLAN_REVENUE'
      });
    }

    const result = await trackGA4PlanRevenue(userId, eventName, amount, paymentId);

    return res.status(200).json({
      status: true,
      message: `GA4 ${eventName} event sent successfully`,
      data: { sent: result }
    });
  } catch (error) {
    console.error('Test GA4 plan revenue error:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to send GA4 plan revenue event',
      error: error.message
    });
  }
};