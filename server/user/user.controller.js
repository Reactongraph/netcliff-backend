const User = require("./user.model");
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
const Subscription = require("../subscription/subscription.model");
const RefreshToken = require("../refreshToken/refreshToken.model");
const { capturePayment, captureEvent, getAttributedUsers } = require('../../util/linkrunner');
const { trackGA4SubscriptionRenewed, trackGA4PlanRevenue } = require('../../util/googleAnalytics');

const JWT_SECRET = process?.env?.JWT_SECRET;

//deleteFromSpace
const { deleteFromSpace } = require("../../util/deleteFromSpace");
const { SNS } = require("../../util/awsServices");
const premiumPlanModel = require("../premiumPlan/premiumPlan.model");
const premiumPlanHistoryModel = require("../premiumPlan/premiumPlanHistory.model");
const { redisClient } = require('../../config/redis');

// MSG91 Service
const msg91Service = require("../../util/msg91Service");
const { resetPasswordTemplate } = require("../../util/emailTemplates");
const { sendEmail } = require("../../util/email");

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
    console.log("req.body ", req.body);

    if (
      !req.body.identity ||
      !req.body.loginType
      //|| !req.body.fcmToken
    )
      return res
        .status(200)
        .json({ status: false, message: "Oops ! Invalid details!!" });

    console.log("req.body ", req.body);

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

      console.log("downloaduserId-----", downloaduserId);

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
      console.log("---------signup----------");

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

      await deleteFromSpace({ folderStructure, keyName });

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

    if (req.body.phoneNumber !== undefined) {
      const raw = String(req.body.phoneNumber).trim();
      if (raw === "") {
        user.phoneNumber = null;
        user.markModified("phoneNumber");
      } else {
        const digitsOnly = raw.replace(/\D/g, "");
        if (digitsOnly.length >= 8 && digitsOnly.length <= 15) {
          user.phoneNumber = digitsOnly;
          user.markModified("phoneNumber");
        }
      }
    }
    if (req.body.phoneCode !== undefined) {
      const code = String(req.body.phoneCode).trim();
      user.phoneCode = code === "" ? null : (code.startsWith("+") ? code : "+" + code);
      user.markModified("phoneCode");
    }

    if (req.body.fcmToken !== undefined) {
      user.fcmToken = req.body.fcmToken && String(req.body.fcmToken).trim() ? req.body.fcmToken.trim() : null;
    }

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
    const user = await User.find().sort({ createdAt: -1 });

    return res.status(200).json({ status: true, message: "Success", user });
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

      await deleteFromSpace({ folderStructure, keyName });
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
    console.log('err', err);
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

    console.log("user", user);

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

    // user.lastLogin = Date.now();
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
      message = `Your one-time password (OTP) for logging into ${process.env.APP_NAME} is ${otp}. This code is valid for a 10 minutes only. Do not share it with anyone for security reasons.`;
      user.otp = otp;
      user.otpExpires = expiryTime;
      await user.save();
    } else {
      // New user - create unverified record
      message = `Your one-time password (OTP) for signing up on ${process.env.APP_NAME} is ${otp}. This code is valid for a 10 minutes only. Do not share it with anyone for security reasons.`;
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

exports.handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];

  console.log("sign", sig, process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET);
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
          subscriptionRevoked: new Date(),
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
    const userUpdate = {
      "plan.status": subscription.status,
      "plan.planStartDate": new Date(
        subscription.current_period_start * 1000
      ),
      "plan.planEndDate": new Date(subscription.current_period_end * 1000),
      "plan.cancelAtPeriodEnd": subscription.cancel_at_period_end,
    };
    if (subscription.cancel_at_period_end) {
      userUpdate.subscriptionRevoked = new Date();
    }
    await User.findByIdAndUpdate(
      subscriptionHistory.userId,
      userUpdate,
      { session }
    );

    // If subscription includes price/plan changes
    if (subscription.items && subscription.items.data.length > 0) {
      const newPriceId = subscription.items.data[0].price.id;
      // update the plan details based on the new price
    }

    console.log(`Subscription updated: ${subscription.id}`);
    console.log("New status:", subscription.status);
    console.log(
      "Current period end:",
      new Date(subscription.current_period_end * 1000)
    );
  } catch (error) {
    console.error("Error in handleSubscriptionUpdated:", error);
    throw error;
  }
};

exports.firebaseLogin = async (req, res) => {
  try {
    const { firebaseToken, deviceId, deviceInfo = {}, fcmToken, campaignId } = req.body;
    console.log("firebase login deviceId", deviceId, deviceInfo);
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
    console.log("firebase login decodedToken", decodedToken);
    // For some providers, name might not be directly available in the token
    // but can be extracted from email for Google/Apple users
    if (!name && email) {
      // Extract name from email prefix as fallback
      name = email.split('@')[0] || '';
    }

    console.log("decodedToken", decodedToken);
    console.log("decodedToken.firebase", decodedToken?.firebase)
    if (decodedToken?.firebase)
      console.log("decodedToken.firebase string", JSON.stringify(decodedToken?.firebase))

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

    if (isGoogleAuth && !email) {
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
    if (!user) {
      user = await User.findOne({
        'sessions.deviceId': deviceId,
        $or: [
          { uniqueId: null },
          { uniqueId: "" },
          { uniqueId: { $exists: false } }
        ]
      }).select('+sessions');
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
      if (phone_number) {
        userData.phoneNumber = phone_number;
      }

      if (email) {
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

      user = new User(userData);
    } else {
      // Update existing user information if needed
      let updated = false;

      // Update core Firebase information
      if (!user.uniqueId && uid) {
        user.uniqueId = uid;
        updated = true;
      }

      if (email && !user.email) {
        user.email = email;
        updated = true;
      }

      if (name && !user.fullName) {
        user.fullName = name;
        updated = true;
      }

      if (picture && !user.image) {
        user.image = picture;
        updated = true;
      }

      // Update fcmToken if provided
      if (fcmToken && user.fcmToken !== fcmToken) {
        user.fcmToken = fcmToken;
        updated = true;
      }

      // Update login type if it's different (upgrade from guest to authenticated)
      const expectedLoginType = isPhoneAuth ? 0 : (isGoogleAuth ? 1 : (isAppleAuth ? 2 : 0)); // 0=phone, 1=google, 2=Apple, 3=guest
      if (user.loginType !== expectedLoginType) {
        user.loginType = expectedLoginType;
        updated = true;
      }

      // If user was found by email but doesn't have phone number, add it
      if (isPhoneAuth && phone_number && !user.phoneNumber) {
        user.phoneNumber = phone_number;
        updated = true;
      }

      // If user was found by phone but doesn't have email, add it
      if (email && !user.email) {
        user.email = email;
        updated = true;
      }

      // Update phone status if not set
      if (!user.phoneStatus) {
        user.phoneStatus = "VERIFIED";
        updated = true;
      }

      // Update campaignId if provided and user doesn't have one
      if (campaignId && !user.campaignId) {
        user.campaignId = campaignId;
        updated = true;
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

    // Create default adult profile if user has no profiles
    if (!user.profiles || user.profiles.length === 0) {
      user.profiles = [{
        name: 'Default',
        type: 'adult',
        isActive: true
      }];
    }

    // Update last login time and save
    user.lastLogin = Date.now();
    await user.save();

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
        plan: user.plan,
        freeTrial: user.freeTrial,
        isNewUser,
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

// Email/password login (supports both web and app)
exports.emailPasswordLogin = async (req, res) => {
  try {
    const {
      email,
      password,
      deviceId, // Optional - required for app, optional for web
      deviceInfo = {},
      fcmToken = ""
    } = req.body || {};

    // Email and password are always required
    if (!email || !password) {
      return res.status(400).json({
        status: false,
        message: "Email and password are required",
      });
    }

    const normalizedEmail = (email || "").toLowerCase().trim();
    const isWebLogin = !deviceId; // Web login doesn't have deviceId

    // Validate credentials against subscriptions collection
    const subscription = await User.findOne({ email: normalizedEmail }).select("+password");
    if (!subscription || !subscription.password) {
      return res.status(401).json({
        status: false,
        message: "Invalid email or password",
      });
    }

    if (subscription.password !== password) {
      return res.status(401).json({
        status: false,
        message: "Invalid email or password",
      });
    }

    
    // // Optional: ensure subscription is active
    // if ((!subscription.planType && subscription.isSubscribed === false) || (subscription.planType)) {
    //   return res.status(403).json({
    //     status: false,
    //     message: "Subscription inactive. Please subscribe first.",
    //   });
    // }
    
    

    // Find or create user record
    let user = await User.findOne({ email: normalizedEmail }).select("+sessions +password");
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = new User({
        email: normalizedEmail,
        fullName: normalizedEmail.split("@")[0] || "",
        loginType: 3, // custom/email login treated as guest/custom
        phoneStatus: "VERIFIED",
        date: new Date().toLocaleString("en-US"),
        fcmToken: fcmToken || null,
        country: subscription.country || null, // Copy country from subscription
        password: subscription.password || null, // Copy password from subscription
        sessions: [], // Initialize sessions array for new user
        profiles: [{
          name: "Default",
          type: "adult",
          isActive: true
        }]
      });
      await user.save();
    } else {
      // Update any missing fields to keep user profile rich
      let updated = false;

      if (!user.fullName && normalizedEmail) {
        user.fullName = normalizedEmail.split("@")[0] || "";
        updated = true;
      }

      if (!user.loginType) {
        user.loginType = 3;
        updated = true;
      }

      if (!user.date) {
        user.date = new Date().toLocaleString("en-US");
        updated = true;
      }

      if (fcmToken && user.fcmToken !== fcmToken) {
        user.fcmToken = fcmToken;
        updated = true;
      }

      // Sync country from subscription if missing or different
      if (subscription.country && user.country !== subscription.country) {
        user.country = subscription.country;
        updated = true;
      }

      // Sync password from subscription if missing or different
      if (subscription.password && user.password !== subscription.password) {
        user.password = subscription.password;
        updated = true;
      }

      if (updated) {
        await user.save();
      }
    }

    let accessToken;
    let refreshToken;

    if (isWebLogin) {
      // Web login: Generate JWT tokens without device session
      const { userRoles } = require("../../util/helper");
      const role = userRoles.USER;

      // Generate tokens for web (no deviceId in token)
      const refreshTokenPayload = {
        userId: user._id,
        country: user.country,
        role,
        tokenType: "refresh"
      };
      
      refreshToken = jwt.sign(
        refreshTokenPayload,
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      // Store refresh token in database
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      await RefreshToken.create({
        token: refreshToken,
        userId: user._id,
        role: role,
        expiresAt: expiresAt,
        isRevoked: false,
      });

      accessToken = jwt.sign(
        {
          userId: user._id,
          country: user.country,
          role
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
    } else {
      // App login: Generate tokens with 1 minute expiration for access token
      const { userRoles } = require("../../util/helper");
      const role = userRoles.USER;
      
      // Generate refresh token (30 days)
      refreshToken = jwt.sign(
        {
          userId: user._id,
          country: user.country,
          deviceId,
          role,
          tokenType: "refresh"
        },
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      // Store refresh token in database
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      await RefreshToken.create({
        token: refreshToken,
        userId: user._id,
        role: role,
        expiresAt: expiresAt,
        isRevoked: false,
      });

      // Generate access token (1 minute)
      accessToken = jwt.sign(
        {
          userId: user._id,
          country: user.country,
          deviceId,
          role
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Save session to user document
      const userWithSessions = await User.findById(user._id).select('+sessions');
      userWithSessions.sessions = userWithSessions.sessions || [];
      userWithSessions.sessions = userWithSessions.sessions.filter(s => s.deviceId !== deviceId);
      userWithSessions.sessions.push({
        refreshToken,
        accessToken,
        deviceId,
        isActive: true,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        deviceInfo
      });
      await userWithSessions.save();
    }

    // Update last login and fcmToken
    user = await User.findById(user._id);
    user.lastLogin = Date.now();
    if (fcmToken) {
      user.fcmToken = fcmToken;
    }
    await user.save();


    return res.status(200).json({
      status: true,
      message: isNewUser ? "Registration successful" : "Login successful",
      data: {
        _id: user._id,
        email: user.email,
        isPremiumPlan: subscription.isSubscribed,
        token: accessToken,
        refreshToken: refreshToken, // Include refreshToken in response
      },
    });
  } catch (error) {
    console.error("Email/password login error:", error);
    return res.status(500).json({
      status: false,
      message: "Error processing request",
      error: error.message,
    });
  }
};

// Send Phone OTP using MSG91
exports.sendPhoneOTP = async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        status: false,
        message: "Phone number is required"
      });
    }

    // Validate phone number
    const validation = msg91Service.validatePhoneNumber(phoneNumber);
    if (!validation.isValid) {
      return res.status(400).json({
        status: false,
        message: validation.error
      });
    }

    // Check if user exists with this phone number (only phone login type)
    let user = await User.findOne({
      phoneNumber: phoneNumber,
      loginType: 0 // Phone login type only
    });

    let isNewUser = false;

    if (!user) {
      // New user - create unverified record (no OTP stored, MSG91 handles it)
      isNewUser = true;
      user = await User.create({
        phoneNumber: phoneNumber,
        phoneStatus: "UNVERIFIED",
        loginType: 0 // Phone login type
      });
    }

    // Send OTP using MSG91's official API (MSG91 generates and manages OTP)
    try {
      await msg91Service.sendOTP(phoneNumber);

      return res.json({
        status: true,
        message: "OTP sent successfully",
        data: {
          phoneNumber: phoneNumber,
          isNewUser: isNewUser,
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
    const { phoneNumber, otp, deviceId, deviceInfo = {}, fcmToken, campaignId } = req.body;
    console.log("Verifying OTP - Phone:", phoneNumber, "OTP:", otp, "DeviceID:", deviceId);

    if (!phoneNumber || !otp || !deviceId) {
      return res.status(400).json({
        status: false,
        message: "Phone number, OTP, and Device ID are required"
      });
    }

    // Find user (don't check OTP in database, MSG91 handles verification)
    let user = await User.findOne({
      phoneNumber: phoneNumber,
      loginType: 0 // Phone login type only
    }).select('+sessions');

    if (!user) {
      return res.status(400).json({
        status: false,
        message: "User not found. Please send OTP first."
      });
    }

    // Verify OTP with MSG91's official API
    try {
      const verification = await msg91Service.verifyOTP(phoneNumber, otp);

      if (!verification.isValid) {
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
        console.log("MSG91 verification successful:", verification);
      }
    } catch (verifyError) {
      console.error('MSG91 OTP verification failed:', verifyError);
      return res.status(400).json({
        status: false,
        message: "OTP verification failed: " + (verifyError.message || "Unknown error"),
        error: verifyError
      });
    }

    // Update phone status to verified
    if (user.phoneStatus === "UNVERIFIED") {
      user.phoneStatus = "VERIFIED";
    }

    // Set unique ID if not exists (for Firebase custom token)
    if (!user.uniqueId) {
      user.uniqueId = user._id.toString(); // Use MongoDB ObjectId as unique identifier
    }

    // Update user with additional information if provided
    let updated = false;

    // Update fcmToken if provided
    if (fcmToken && user.fcmToken !== fcmToken) {
      user.fcmToken = fcmToken;
      updated = true;
    }

    // Update campaignId if provided and user doesn't have one
    if (campaignId && !user.campaignId) {
      user.campaignId = campaignId;
      updated = true;
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

    // Create default adult profile if user has no profiles
    if (!user.profiles || user.profiles.length === 0) {
      user.profiles = [{
        name: 'Default',
        type: 'adult',
        isActive: true
      }];
    }

    // Update last login time and save
    user.lastLogin = Date.now();
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
      const isNewUser = user.phoneStatus === "VERIFIED";

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
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        status: false,
        message: "Phone number is required"
      });
    }

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

    // Resend OTP using MSG91's official retry API
    try {
      await msg91Service.resendOTP(phoneNumber);

      return res.json({
        status: true,
        message: "OTP resent successfully",
        data: {
          phoneNumber: phoneNumber,
          expiresIn: 600 // seconds
        }
      });
    } catch (smsError) {
      console.error('MSG91 OTP resending failed:', smsError);

      return res.status(500).json({
        status: false,
        message: "Failed to resend OTP",
        error: smsError.message
      });
    }

  } catch (error) {
    console.error("Resend Phone OTP error:", error);
    return res.status(500).json({
      status: false,
      message: "Error processing request",
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

    console.log("isExistingUser", isExistingUser);
    console.log("user", user);
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
    console.error('Error in checkOrCreateDevice:', error);
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

    if (!['MONTH_PLAN_REVENUE', 'YEAR_PLAN_REVENUE'].includes(eventName)) {
      return res.status(400).json({
        status: false,
        message: 'eventName must be 3_MONTH_PLAN_REVENUE or 1_YEAR_PLAN_REVENUE'
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

/**
 * Get the number of users with active subscription for a specific month based on country and date
 * @param {string} country - Country code (e.g., "SA", "EG", "IN")
 * @param {Date|string} date - Date object or date string (will be used to determine the month)
 * @returns {Promise<number>} Number of users with active subscription for that month
 */
exports.getUsersWithSubscriptionByCountryAndMonth = async (country, date) => {
  try {
    if (!country || !date) {
      throw new Error('Country and date are required');
    }

    // Parse the date
    const targetDate = moment(date);
    if (!targetDate.isValid()) {
      throw new Error('Invalid date provided');
    }

    // Get start of the month
    const monthStart = targetDate.startOf('month').toDate();

    // Build query to find users with active subscription for the given month
    // A user has an active subscription for a month if subscriptionExpiry >= monthStart
    const query = {
      country: country,
      isBlock: false, // Exclude blocked users
      subscriptionExpiry: { $exists: true, $gte: monthStart }
    };

    // Count users matching the criteria
    const count = await User.countDocuments(query);

    return count;
  } catch (error) {
    console.error('Error in getUsersWithSubscriptionByCountryAndMonth:', error);
    throw error;
  }
};

/**
 * Get the weight (count) of unique subscribed users who watched a video
 * @param {string|ObjectId} movieId - Movie/Series ID
 * @param {string} [country] - Optional country code to filter users (e.g., "SA", "EG", "IN")
 * @returns {Promise<number>} Weight (count of unique subscribed users who watched)
 */
exports.getWeightOfSubscribedUsersWatchedVideo = async (movieId, country = null) => {
  try {
    if (!movieId) {
      throw new Error('MovieId is required');
    }

    // Convert to ObjectId if string
    const movieObjectId = mongoose.Types.ObjectId.isValid(movieId) 
      ? new mongoose.Types.ObjectId(movieId) 
      : movieId;

    // Current date to check active subscriptions
    const currentDate = new Date();

    // Build match query for ViewedContent
    const matchQuery = {
      movieId: movieObjectId,
      userId: { $exists: true, $ne: null } // Only authenticated users
    };

    // Build user filter for subscribed users
    const userFilter = {
      "user.subscriptionExpiry": { $exists: true, $gte: currentDate },
      "user.isBlock": false
    };

    // Add country filter if provided
    if (country) {
      userFilter["user.country"] = country;
    }

    // Aggregation pipeline to get unique subscribed users
    const pipeline = [
      // Stage 1: Match viewed content for the video
      {
        $match: matchQuery
      },
      // Stage 2: Lookup user details
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user"
        }
      },
      // Stage 3: Unwind user array
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: false
        }
      },
      // Stage 4: Filter only subscribed users (subscriptionExpiry >= currentDate) and optionally by country
      {
        $match: userFilter
      },
      // Stage 5: Group by userId to get unique users
      {
        $group: {
          _id: "$userId"
        }
      },
      // Stage 6: Count unique users
      {
        $count: "weight"
      }
    ];

    // Execute aggregation
    const result = await ViewedContent.aggregate(pipeline);

    // Extract weight (count) or return 0 if no results
    const weight = result.length > 0 ? result[0].weight : 0;

    return weight;
  } catch (error) {
    console.error('Error in getWeightOfSubscribedUsersWatchedVideo:', error);
    throw error;
  }
};

/**
 * Get the total viewed duration for a video based on country
 * @param {string|ObjectId} movieId - Movie/Series ID
 * @param {string} [country] - Optional country code to filter users (e.g., "SA", "EG", "IN")
 * @returns {Promise<number>} Total viewed duration in seconds
 */
exports.getCountryViewedDurationForVideo = async (movieId, country = null) => {
  try {
    if (!movieId) {
      throw new Error('MovieId is required');
    }

    // Convert to ObjectId if string
    const movieObjectId = mongoose.Types.ObjectId.isValid(movieId) 
      ? new mongoose.Types.ObjectId(movieId) 
      : movieId;

    // Build match query for ViewedContent
    const matchQuery = {
      movieId: movieObjectId,
      userId: { $exists: true, $ne: null } // Only authenticated users
    };

    // Build user filter
    const userFilter = {
      "user.isBlock": false
    };

    // Add country filter if provided
    if (country) {
      userFilter["user.country"] = country;
    }

    // Aggregation pipeline to get total viewed duration
    const pipeline = [
      // Stage 1: Match viewed content for the video
      {
        $match: matchQuery
      },
      // Stage 2: Lookup user details
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user"
        }
      },
      // Stage 3: Unwind user array
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: false
        }
      },
      // Stage 4: Filter by country if provided
      {
        $match: userFilter
      },
      // Stage 5: Group and sum watchTime
      {
        $group: {
          _id: null,
          totalDuration: { $sum: "$watchTime" }
        }
      }
    ];

    // Execute aggregation
    const result = await ViewedContent.aggregate(pipeline);

    // Extract total duration or return 0 if no results
    const totalDuration = result.length > 0 ? result[0].totalDuration : 0;

    return totalDuration;
  } catch (error) {
    console.error('Error in getCountryViewedDurationForVideo:', error);
    throw error;
  }
};

// Get subscription status for authenticated user
exports.getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        status: false,
        message: "User ID not found in token",
        code: "USER_ID_MISSING" 
      });
    }

    const user = await User.findById(userId).select("subscriptionExpiry planType");

    if (!user) {
      return res.status(200).json({
        status: true,
        message: "User not found",
        planType: null
      });
    }

    const currentDate = new Date();
    const subscriptionExpiry = user.subscriptionExpiry || null;
    
    // Check if subscription is valid (not expired)
    const planType = user.planType || null;

    const responseData = {
      status: true,
      message: "Subscription status retrieved successfully",
      planType: planType
    };
    if(planType === "free_trial") {
      responseData.message = "User has free trial";
    }
    
    const isExpired = new Date(subscriptionExpiry) < currentDate;
    if(isExpired) {
      responseData.message = "User has expired subscription and converted to free trial";
      responseData.planType = "free_trial";
      user.planType = "free_trial";
      await user.save();
    }

    if(!isExpired){
      responseData.message = "User has active subscription";
      responseData.subscriptionExpiry = subscriptionExpiry;
      responseData.planType = planType;
      
      // Calculate remaining minutes for monthly or yearly plans
      if(planType === "monthly" || planType === "yearly") {
        const timeDifference = new Date(subscriptionExpiry) - currentDate;
        const remainingMinutes = Math.floor(timeDifference / (1000 * 60)); // Convert milliseconds to minutes
        responseData.remainingMinutes = remainingMinutes > 0 ? remainingMinutes : 0;
      }
    }


    return res.status(200).json(responseData);
  } catch (error) {
    console.error('Error in getSubscriptionStatus:', error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
      code: "SERVER_ERROR"
    });
  }
};

//forgot admin password (send email for forgot the password)
exports.forgotPassword = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    
    if (!user) {
      return res.status(400).json({
        status: false,
        message: "User does not found with that email.",
      });
    }
    
    if (user.isBlock) {
      return res.status(400).json({
        status: false,
        message: "User is blocked.",
      });
    }

    // Generate JWT token with 15-minute expiry (minimal payload for smaller token size)
    const tokenPayload = {
      id: user._id.toString(),
      t: "pr", // type: password-reset
    };
    const resetToken = jwt.sign(tokenPayload, process?.env?.JWT_SECRET, {
      expiresIn: "15m",
    });

    const template = resetPasswordTemplate();
    let html = template.html;
    const frontendURL = process?.env?.PWA_URL;
    let url = ''

    if (frontendURL?.endsWith('/')) {
      url = `${frontendURL}user/changePassword/${resetToken}`;
    } else {
      url = `${frontendURL}/user/changePassword/${resetToken}`;
    }

    console.log(url)
    html = html.replace(
      "{{RESET_LINK}}",
      url
    );

    const emailStatus = await sendEmail(user.email, template.subject, html);

    if (!emailStatus) {
      return res.status(500).json({
        status: false,
        error: "Error while sending email.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Email Send Successfully.",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//validate reset token
exports.validateResetToken = async (req, res) => {
  try {
    const resetToken = req.query.token;
    
    if (!resetToken) {
      return res.status(400).json({
        status: false,
        message: "Reset token is required",
      });
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(resetToken, process?.env?.JWT_SECRET);
      
      // Verify token type
      if (decoded.t !== "pr") {
        return res.status(400).json({
          status: false,
          message: "Invalid token type",
        });
      }

      // Verify admin exists
      const userId = decoded.id || decoded.userId;
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(400).json({
          status: false,
          message: "User not found",
        });
      }

      return res.status(200).json({
        status: true,
        message: "Token is valid",
      });
    } catch (tokenError) {
      if (tokenError.name === "TokenExpiredError") {
        return res.status(400).json({
          status: false,
          message: "Reset token has expired",
        });
      }
      return res.status(400).json({
        status: false,
        message: "Invalid or expired reset token",
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//set Admin Password
exports.setPassword = async (req, res) => {
  try {
    // Get token from query params or body
    const resetToken = req.query.token || req.body.token;
    
    if (!resetToken) {
      return res.status(200).json({
        status: false,
        message: "Reset token is required",
      });
    }

    const newPassword = req.body?.newPassword?.trim()
    if (!newPassword?.length) {
      return res.status(200).json({
        status: false,
        message: "New password is required",
      });
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(resetToken, process?.env?.JWT_SECRET);
      
      // Verify token type
      if (decoded.t !== "pr") {
        return res.status(200).json({
          status: false,
          message: "Invalid token type",
        });
      }
    } catch (tokenError) {
      if (tokenError.name === "TokenExpiredError") {
        return res.status(200).json({
          status: false,
          message: "Reset token has expired. Please request a new password reset.",
        });
      }
      return res.status(200).json({
        status: false,
        message: "Invalid or expired reset token",
      });
    }

    // Get admin ID from token (preferred) or fallback to query param for backward compatibility
    const userId = decoded.id || decoded.userId || req.query.userId;
    
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(200)
        .json({ status: false, message: "User does not found!!" });
    }

    // Comment down as notice not using bcrypt currently
    user.password = newPassword;

    await user.save();

    return res.status(200).json({
      status: true,
      message: "Password Changed Successful ✔✔✔",
      user: {
        ...user.toObject(),
        password: undefined,
      },
    }); 
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error!!",
    });
  }
};
