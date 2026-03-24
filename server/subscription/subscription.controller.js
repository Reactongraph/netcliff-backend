const Subscription = require("./subscription.model");
const PremiumPlan = require("../premiumPlan/premiumPlan.model");
const Transaction = require("./transaction.model");
const CheckoutInitiation = require("./checkoutInitiation.model");
const UsedRenewToken = require("./usedRenewToken.model");
const User = require("../user/user.model");
const Coupon = require("../coupon/coupon.model");
const crypto = require("crypto");
const { stripe } = require("../../util/stripe");
const { sendEmail } = require("../../util/email");
const { subscriptionSignupTemplate, subscriptionRenewalTemplate, subscriptionCancelTemplate } = require("../../util/emailTemplates");
const jwtUtils = require("../../util/jwtUtils");
const { incrementAnalytics } = require("../analytics/analytics.controller");

// function generateToken() {
//   return crypto.randomBytes(32).toString("hex");
// }

/**
 * Helper to get and validate SIGNUP_URL
 * @returns {string} Cleaned signup URL
 * @throws {Error} if SIGNUP_URL is not defined
 */
function getSignupUrl() {
  const signupUrl = process.env.SIGNUP_URL;
  if (!signupUrl) {
    throw new Error("SIGNUP_URL environment variable is not defined");
  }
  return signupUrl.replace(/\/+$/, "");
}


/**
 * Updates or creates user subscription with proper expiry handling
 * @param {Object} user - User document
 * @param {string} planType - 'yearly' or 'monthly'
 * @returns {Object} Updated user document
 */
async function updateUserSubscription(user, planType) {
  const now = new Date();

  // If user has an existing subscription that's not expired, extend it
  if (user.subscriptionExpiry && user.subscriptionExpiry >= now) {
    if (planType === "yearly") {
      // Add 1 year to existing expiry
      user.subscriptionExpiry.setFullYear(
        user.subscriptionExpiry.getFullYear() + 1
      );
      console.log(
        `↗️ Extended existing subscription by 1 year. New expiry: ${user.subscriptionExpiry}`
      );
    } else {
      // Add 1 month to existing expiry
      user.subscriptionExpiry.setMonth(user.subscriptionExpiry.getMonth() + 1);
      console.log(
        `↗️ Extended existing subscription by 1 month. New expiry: ${user.subscriptionExpiry}`
      );
    }
  } else {
    // No active subscription or expired, set new expiry from now
    if (planType === "yearly") {
      user.subscriptionExpiry = new Date();
      user.subscriptionExpiry.setFullYear(
        user.subscriptionExpiry.getFullYear() + 1
      );
      console.log(
        `🆕 New yearly subscription. Expiry: ${user.subscriptionExpiry}`
      );
    } else {
      user.subscriptionExpiry = new Date();
      user.subscriptionExpiry.setMonth(user.subscriptionExpiry.getMonth() + 1);
      console.log(
        `🆕 New monthly subscription. Expiry: ${user.subscriptionExpiry}`
      );
    }
  }
  if (planType === "free") {
    user.subscriptionExpiry = null;
  }

  // Update subscription status and plan type
  // user.isSubscribed = true;
  user.planType = planType;

  return user;
}

// Send subscription signup email (always sends email for all platforms)
async function sendSubscriptionEmail(email, token, deviceType = null) {
  try {
    const frontendUrl = getSignupUrl();
    const deviceQuery = deviceType ? `?device=${encodeURIComponent(deviceType)}` : "";
    const signupLink = `${frontendUrl}/${token}${deviceQuery}`;
    const template = subscriptionSignupTemplate();
    const html = template.html.replace(/{{SIGNUP_LINK}}/g, signupLink);
    const emailStatus = await sendEmail(email, template.subject, html);

    if (!emailStatus) {
      console.error(
        "Failed to send email, but subscription was created/updated"
      );
    }

    return signupLink;
  } catch (error) {
    console.error("Error sending subscription email:", error);
    // Return signup link even if email fails
    const frontendUrl = getSignupUrl();
    const deviceQuery = deviceType ? `?device=${encodeURIComponent(deviceType)}` : "";
    return `${frontendUrl}/${token}${deviceQuery}`;
  }
}

/**
 * Get device type from request: body.deviceType, then headers (X-Device-Type, X-Platform, etc.), then User-Agent.
 * Flutter apps send User-Agent like "Dart/3.10 (dart:io)" so we treat "dart:io" as native (mobile).
 * @param {Object} req - Express request
 * @returns {string} - 'android' | 'ios' | 'web' | 'mobile' | etc.
 */
function getDeviceTypeFromRequest(req) {
  const fromBody = req.body?.deviceType;
  if (fromBody && typeof fromBody === "string" && fromBody.trim()) {
    return fromBody.trim().toLowerCase();
  }
  const deviceHeader = req.get("x-device-type") || req.get("X-Device-Type");
  if (deviceHeader && typeof deviceHeader === "string" && deviceHeader.trim()) {
    return deviceHeader.trim().toLowerCase();
  }
  // Same platform headers as requestLogger (app can send X-Platform: android etc.)
  const platformHeaderNames = ["x-platform", "platform", "x-client", "x-app-platform"];
  const allowedPlatforms = ["web", "ios", "android"];
  for (const name of platformHeaderNames) {
    const val = req.get && req.get(name);
    if (val && typeof val === "string" && val.trim()) {
      const v = val.trim().toLowerCase();
      if (allowedPlatforms.includes(v)) return v;
    }
  }
  const ua = (req.get("user-agent") || "").toLowerCase();
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipod/i.test(ua)) return "ios";
  if (/ipad/i.test(ua)) return "ipad";
  if (/mobile/i.test(ua)) return "mobile";
  // Flutter native apps (Android/iOS) send "Dart/x.x (dart:io)" — no "android" in UA, so treat as mobile (non-web)
  if (/dart:io/i.test(ua)) return "mobile";
  return "web";
}

// Send subscription renewal email (always sends email for all platforms when isOnlyLink is false)
exports.sendRenewalEmail = async (email, token, isOnlyLink = false, deviceType = null) => {
  try {
    const frontendUrl = getSignupUrl();
    const deviceQuery = deviceType ? `?device=${encodeURIComponent(deviceType)}` : "";
    const signupLink = `${frontendUrl}/renew/${token}${deviceQuery}`;

    if (isOnlyLink) {
      return signupLink;
    }
    const template = subscriptionRenewalTemplate();
    const html = template.html.replace(/{{SIGNUP_LINK}}/g, signupLink);
    const emailStatus = await sendEmail(email, template.subject, html);

    if (!emailStatus) {
      console.error(
        "Failed to send renewal email, but renewal link was generated"
      );
    }

    return signupLink;
  } catch (error) {
    console.error("Error sending renewal email:", error);
    // Return signup link even if email fails
    const frontendUrl = getSignupUrl();
    const deviceQuery = deviceType ? `?device=${encodeURIComponent(deviceType)}` : "";
    return `${frontendUrl}/renew/${token}${deviceQuery}`;
  }
}

// Send cancel subscription email with link (builds /cancel/token URL and sends email)
exports.sendCancelEmail = async (email, token, isOnlyLink = false) => {
  try {
    const frontendUrl = getSignupUrl();
    const cancelLink = `${frontendUrl}/cancel/${token}`;

    if (isOnlyLink) {
      return cancelLink;
    }

    const template = subscriptionCancelTemplate();
    const html = template.html.replace(/{{CANCEL_LINK}}/g, cancelLink);
    const emailStatus = await sendEmail(email, template.subject, html);

    if (!emailStatus) {
      console.error(
        "Failed to send cancel subscription email, but cancel link was generated"
      );
    }

    return cancelLink;
  } catch (error) {
    console.error("Error sending cancel subscription email:", error);
    const frontendUrl = getSignupUrl();
    return `${frontendUrl}/cancel/${token}`;
  }
};

// Cancel subscription link controller - generates /cancel/token link (uses JWT from header, no body)
exports.cancelSubscriptionLink = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    if (!userId) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    const email = (existingUser.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({
        status: false,
        message: "User email not found",
      });
    }

    const token = jwtUtils.generateToken({ email }, "1h");
    const cancelLink = await exports.sendCancelEmail(email, token, false);

    return res.status(200).json({
      status: true,
      message: "Cancel subscription link generated successfully",
      email,
      token,
      link: cancelLink,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server error",
    });
  }
};

// Create Stripe Customer Portal session for cancel subscription (from /cancel/token link)
exports.createCancelPortalSession = async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({
        status: false,
        message: "Token is required",
      });
    }

    const decoded = jwtUtils.verifyToken(token);
    const email = (decoded.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({
        status: false,
        message: "Invalid token",
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    console.log("user>>>>>>>>>>>>>", user);

    const customerId = user.plan?.customerId;
    if (!customerId) {
      return res.status(400).json({
        status: false,
        message: "No Stripe customer found for this account",
      });
    }

    const frontendUrl = getSignupUrl();
    const returnUrl = `${frontendUrl}/cancel/${token}?cancel=done`;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return res.status(200).json({
      status: true,
      url: portalSession.url,
    });
  } catch (error) {
    if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
      return res.status(400).json({
        status: false,
        message: "Invalid or expired link. Please request a new cancel link.",
      });
    }
    console.error("Create cancel portal session error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Error creating cancel session",
    });
  }
};

//subscription email controller
// exports.subscribeEmail = async (req, res) => {
//   try {
//     if (!req.body.email) {
//       throw new Error("Email is required.");
//     }
//     if (
//       !req.body.country ||
//       typeof req.body.country !== "string" ||
//       !req.body.country.trim()
//     ) {
//       throw new Error("Country is required.");
//     }

//     const email = req.body.email.trim().toLowerCase();
//     const country = req.body.country.trim();

//     // Check if email exists in users collection
//     const existingUser = await User.findOne({ email: email });

//     // Block signup ONLY if user exists in users collection AND isPremiumPlan is true
//     if (existingUser) {
//       if (existingUser.passwordCreated) {
//         throw new Error("Email already exists Please login to continue");
//       }

//       if (!existingUser.isPremiumPlan) {
//         const token = generateToken();
//         let signupLink = await sendSubscriptionEmail(email, token);

//         return res.status(200).json({
//           status: true,
//           message: "Email already exists Please subscribe to continue",
//           email: email,
//           country: country || null,
//           token: token,
//           link: signupLink,
//         });
//       }
//     }

//     if (!existingUser) {
//       const newUser = new User({
//         email: email,
//         fullName: email.split("@")[0] || "",
//         country: country || null,
//         token: token,
//         tokenExpiresAt: tokenExpiresAt,
//         isSubscribed: false,
//         passwordCreated: false,
//         loginType: 3, // Email/password login
//         phoneStatus: "VERIFIED",
//         date: new Date().toLocaleString("en-US"),
//         isPremiumPlan: false,
//         profiles: [
//           {
//             name: "Default",
//             type: "adult",
//             isActive: true,
//           },
//         ],
//         currentSubscription: subscriptionData._id,
//       });

//       let userData = await newUser.save();

//       const newSubscription = new Subscription({
//         email: email,
//         token: token,
//         tokenExpiresAt: tokenExpiresAt,
//         isSubscribed: false,
//         passwordCreated: false,
//         country: country,
//         userId: userData._id,
//       });
//       subscriptionData = await newSubscription.save();
//     }

//     // Check if email exists in subscriptions collection (for updating/creating)
//     const existingSubscription = await Subscription.findOne({ email: email });

//     // Generate unique token
//     let token = generateToken();
//     let tokenExists = true;

//     // Ensure token is unique (check if it exists in database)
//     while (tokenExists) {
//       const existingToken = await Subscription.findOne({ token: token });
//       if (!existingToken) {
//         tokenExists = false;
//       } else {
//         token = generateToken();
//       }
//     }

//     // Set token expiration to 30 minutes from now
//     const tokenExpiresAt = new Date();
//     tokenExpiresAt.setMinutes(tokenExpiresAt.getMinutes() + 30);

//     // If subscription exists, update it; otherwise create new one
//     let subscriptionData = existingSubscription;
//     if (existingSubscription) {
//       existingSubscription.token = token;
//       existingSubscription.tokenExpiresAt = tokenExpiresAt;
//       if (country) existingSubscription.country = country;
//       await existingSubscription.save();
//     } else {
//       // Create new subscription if doesn't exist
//       const newSubscription = new Subscription({
//         email: email,
//         token: token,
//         tokenExpiresAt: tokenExpiresAt,
//         isSubscribed: false,
//         passwordCreated: false,
//         country: country,
//       });
//       subscriptionData = await newSubscription.save();
//     }

//     // Create or update user in users collection
//     if (existingUser) {
//       // Update existing user with subscription fields
//       if (country && !existingUser.country) {
//         existingUser.country = country;
//       }
//       existingUser.email = email;
//       existingUser.token = token;
//       existingUser.tokenExpiresAt = tokenExpiresAt;
//       existingUser.isSubscribed = false;
//       existingUser.passwordCreated = false;
//       existingUser.currentSubscription = subscriptionData._id;
//       await existingUser.save();
//       console.log("✅ Updated existing user:", existingUser._id);
//     } else {
//       // Create new user with all subscription fields

//       console.log("✅ Created new user:", newUser._id);
//     }

//     // Send email with signup link
//     const signupLink = await sendSubscriptionEmail(email, token);

//     return res.status(200).json({
//       status: true,
//       message: "Email got it",
//       email: email,
//       country: country || null,
//       token: token,
//       link: signupLink,
//     });
//   } catch (error) {
//     console.error(error);
//     // Return 400 for validation errors, 500 for server errors
//     const statusCode =
//       error.message.includes("required") ||
//       error.message.includes("already exists")
//         ? 400
//         : 500;
//     return res.status(statusCode).json({
//       status: false,
//       error: error.message || "Internal Server error",
//     });
//   }
// };

exports.subscribeEmail = async (req, res) => {
  try {
    if (!req.body.email) {
      throw new Error("Email is required.");
    }
    if (
      !req.body.country ||
      typeof req.body.country !== "string" ||
      !req.body.country.trim()
    ) {
      throw new Error("Country is required.");
    }

    const email = req.body.email.trim().toLowerCase();
    const country = req.body.country.trim();
    const phoneCode = req.body.phoneCode ? req.body.phoneCode.trim() : null;
    const mobileNumber = req.body.mobileNumber ? req.body.mobileNumber.trim() : null;
    const deviceType = getDeviceTypeFromRequest(req);

    // Check if email exists in users collection
    const existingUser = await User.findOne({ email: email });

    // Block signup ONLY if user exists in users collection AND isPremiumPlan is true
    let message = "";
    if (existingUser) {
      if (existingUser.passwordCreated) {
        throw new Error("Email already exists Please login to continue");
      }

      if (!existingUser.isPremiumPlan) {
        message = "Email already exists Please subscribe to continue";
      }
    }

    // phone code & phone number
    if (!existingUser) {
      const newUser = new User({
        email: email,
        fullName: email.split("@")[0] || "",
        country: country || null,
        phoneCode: phoneCode,
        phoneNumber: mobileNumber,
        planType: null,
        passwordCreated: false,
        loginType: 3, // Email/password login
        phoneStatus: "VERIFIED",
        date: new Date().toLocaleString("en-US"),
        isPremiumPlan: false,
        profiles: [
          {
            name: "Default",
            type: "adult",
            isActive: true,
          },
        ],
      });

      let userData = await newUser.save();
      console.log("✅ Created new user:", userData);
      // const token = jwtUtils.generateToken({ email: email }, "1h");
      // const newSubscription = new Subscription({
      //   email: email,
      //   token: token,
      //   userId: userData._id,
      // });
      // await newSubscription.save();
      // console.log("✅ Created new subscription:", newSubscription._id);
      message = "Email got it";
    }
    const token = jwtUtils.generateToken({ email: email }, "1h");
    let signupLink = await sendSubscriptionEmail(email, token, deviceType);

    return res.status(200).json({
      status: true,
      message: message,
      email: email,
      country: country || null,
      phoneCode: phoneCode,
      mobileNumber: mobileNumber,
      deviceType: deviceType,
      token: token,
      link: signupLink,
    });
  } catch (error) {
    console.error(error);
    // Return 400 for validation errors, 500 for server errors
    const statusCode =
      error.message.includes("required") ||
        error.message.includes("already exists")
        ? 400
        : 500;
    return res.status(statusCode).json({
      status: false,
      message: error.message || "Internal Server error",
    });
  }
};

// Renew subscription email controller
exports.renewSubscription = async (req, res) => {
  try {
    if (!req.body.email) {
      throw new Error("Email is required.");
    }
    if (
      !req.body.country ||
      typeof req.body.country !== "string" ||
      !req.body.country.trim()
    ) {
      throw new Error("Country is required.");
    }

    const email = req.body.email.trim().toLowerCase();
    const country = req.body.country.trim();
    const deviceType = getDeviceTypeFromRequest(req);
    const skipEmail = req.query.view === "true";

    // Check if email exists in users collection
    const existingUser = await User.findOne({ email: email });

    // Check if user exists
    if (!existingUser) {
      throw new Error("User not found. Please sign up first.");
    }

    // Update user's country field - COMMENTED OUT: avoid any User write in stripe/renew flow; only webhook should write User (subscriptionExpiry). Re-enable if country update is required here.
    // existingUser.country = country;
    // await existingUser.save();
    // console.log("✅ Updated user country:", existingUser._id, "to", country);

    // Generate token for renewal link (include device in link for client)
    const token = jwtUtils.generateToken({ email: email }, "1h");
    let renewalLink = await exports.sendRenewalEmail(email, token, skipEmail, deviceType);

    return res.status(200).json({
      status: true,
      message: skipEmail ? "Renewal link generated" : "Renewal email sent successfully",
      email: email,
      country: country || null,
      deviceType: deviceType,
      token: token,
      link: renewalLink,
    });
  } catch (error) {
    console.error(error);
    // Return 400 for validation errors, 500 for server errors
    const statusCode =
      error.message.includes("required") ||
        error.message.includes("not found")
        ? 400
        : 500;
    return res.status(statusCode).json({
      status: false,
      message: error.message || "Internal Server error",
    });
  }
};

// Verify token controller
exports.verifyToken = async (req, res) => {
  try {
    const token = req.params.token;
    if (!token) {
      return res.status(200).json({
        status: false,
        message: "Token is required.",
      });
    }

    const decoded = jwtUtils.verifyToken(token);
    if (!decoded || !decoded.email) {
      return res.status(200).json({
        status: false,
        message: "Invalid or expired token.",
      });
    }

    // Find user by email (transitional: was using Subscription model)
    const user = await User.findOne({ email: decoded.email });

    if (!user) {
      return res.status(200).json({
        status: false,
        message: "User not found for the provided token.",
      });
    }

    // Optionally check if token matches what we have in DB
    // if (user.token !== token) {
    //   throw new Error("Token mismatch.");
    // }

    return res.status(200).json({
      status: true,
      message: "Token verified successfully.",
      email: decoded.email,
      userData: user,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server error",
    });
  }
};

// Parse signup URL and return subscription data by token (POST with { url })
exports.parseSignupUrl = async (req, res) => {
  try {
    const { token } = req.body || {};

    if (!token) {
      return res.status(400).json({
        status: false,
        message: "token is required",
      });
    }

    // Decode JWT token and extract only the details saved in the token
    let tokenEmail = null;
    let tokenIat = null;
    let tokenExp = null;

    try {
      // Verify and decode the JWT token
      const decodedToken = jwtUtils.verifyToken(token);

      // Extract only the details that are saved in the token
      tokenEmail = decodedToken.email || null;
      tokenIat = decodedToken.iat || null; // Issued at (Unix timestamp)
      tokenExp = decodedToken.exp || null; // Expires at (Unix timestamp)

      console.log("✅ Token decoded successfully:", {
        email: tokenEmail,
        iat: tokenIat,
        exp: tokenExp
      });
    } catch (error) {
      // Token is invalid or expired
      console.log("❌ Token decode error:", error.message);
      return res.status(400).json({
        status: false,
        message: error.message || "Invalid or expired token",
        valid: false
      });
    }

    // Check token expiry using the expiration timestamp from the token itself
    const now = Math.floor(Date.now() / 1000); // Current time in Unix timestamp (seconds)
    if (tokenExp && tokenExp < now) {
      return res.status(200).json({
        status: false,
        message: "Token has expired.",
        valid: false,
        expired: true,
      });
    }

    // Find user by email from token
    if (!tokenEmail) {
      return res.status(400).json({
        status: false,
        message: "Email not found in token.",
        valid: false,
      });
    }

    const user = await User.findOne({ email: tokenEmail });
    if (!user) {
      return res.status(200).json({
        status: false,
        message: "User not found for this token.",
        valid: false,
      });
    }

    // Convert to object to ensure we get all fields
    const userObj = user.toObject ? user.toObject() : user;

    // Convert tokenExp (Unix timestamp) to Date object for tokenExpiresAt
    const tokenExpiresAtDate = tokenExp ? new Date(tokenExp * 1000) : null;

    // Ensure country is always included (convert undefined to null)
    const countryValue = userObj.hasOwnProperty("country")
      ? userObj.country !== undefined && userObj.country !== null
        ? userObj.country
        : null
      : null;

    // Return exact same response structure using user data
    const responseData = {
      status: true,
      message: "Token is valid.",
      valid: true,
      _id: userObj._id,
      email: userObj.email,
      token: token, // Use the token from request
      tokenExpiresAt: tokenExpiresAtDate, // Convert from tokenExp
      planType: userObj.planType || null,
      passwordCreated: userObj.passwordCreated || false,
      country: countryValue, // Always explicitly include country field
      phoneCode: userObj.phoneCode != null ? userObj.phoneCode : null,
      mobileNumber: userObj.phoneNumber != null ? userObj.phoneNumber : null,
      createdAt: userObj.createdAt,
      updatedAt: userObj.updatedAt,
      planType: userObj.planType || null,
      subscriptionExpiry: userObj.subscriptionExpiry || userObj.plan?.planEndDate || null,
      __v: 0, // User model has versionKey: false, so always 0
    };

    // Console log all user data
    console.log(responseData);

    return res.status(200).json(responseData);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

// Get subscription data by token - returns user fields
exports.getSubscriptionByToken = async (req, res) => {
  try {
    const token = req.params.token;
    if (!token) {
      return res.status(200).json({
        status: false,
        message: "Token is required.",
      });
    }

    // Search for user with this token
    const user = await User.findOne({ token: token });

    if (!user) {
      // Fallback: search by email from decoded token
      try {
        const decoded = jwtUtils.verifyToken(token);
        if (decoded && decoded.email) {
          const userByEmail = await User.findOne({ email: decoded.email });
          if (userByEmail) {
            return res.status(200).json({
              status: true,
              data: userByEmail,
            });
          }
        }
      } catch (e) {
        console.error("Token decode error in fallback:", e.message);
      }

      return res.status(200).json({
        status: false,
        message: "User not found for the provided token.",
      });
    }

    return res.status(200).json({
      status: true,
      data: user,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server error",
    });
  }
};

// Mark renew token as used (add to usedRenewTokens collection) - called from Signup after successful renew payment
exports.markRenewTokenUsed = async (req, res) => {
  try {
    const token = (req.body && req.body.token) || req.params.token;
    if (!token || typeof token !== "string" || !token.trim()) {
      return res.status(400).json({
        status: false,
        message: "Token is required.",
      });
    }
    const trimmedToken = token.trim();

    let email = null;
    try {
      const decoded = jwtUtils.verifyToken(trimmedToken);
      email = (decoded && decoded.email) || null;
    } catch (err) {
      return res.status(400).json({
        status: false,
        message: err.message || "Invalid or expired token.",
      });
    }

    await UsedRenewToken.findOneAndUpdate(
      { token: trimmedToken },
      { $setOnInsert: { token: trimmedToken, email, usedAt: new Date() } },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      status: true,
      message: "Renew token marked as used.",
    });
  } catch (error) {
    console.error("markRenewTokenUsed error:", error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

// Check if renew token was already used (in usedRenewTokens) - for renew flow to skip plan page and show success
exports.checkRenewTokenUsed = async (req, res) => {
  try {
    const token = (req.body && req.body.token) || req.query.token;
    if (!token || typeof token !== "string" || !token.trim()) {
      return res.status(400).json({
        status: false,
        message: "Token is required.",
      });
    }
    const trimmedToken = token.trim();

    const doc = await UsedRenewToken.findOne({ token: trimmedToken }).lean();
    const used = !!doc;

    return res.status(200).json({
      status: true,
      used,
    });
  } catch (error) {
    console.error("checkRenewTokenUsed error:", error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

// Get available subscription plans (from plans collection)
// Optional: filter by country if provided in query params
exports.getPlans = async (req, res) => {
  try {
    const {
      country,
      status, // status: "active" | "disabled"
      search, // matches name/product_id/current_price/heading
      page,
      limit,
    } = req.query;

    const pageNum = Number.parseInt(page, 10) || 1;
    const limitNumRaw = Number.parseInt(limit, 10);
    const limitNum = Number.isFinite(limitNumRaw) && limitNumRaw > 0 ? limitNumRaw : 10;
    const hasPagination = page !== undefined || limit !== undefined;

    // Build query - always filter by planStatus === "active"
    // If country is provided, also filter by country
    // If country is null/undefined in plan, it means available for all countries
    let query = {};

    if (country) {
      query = {
        $or: [
          { country: country },
          { country: null },
          { country: { $exists: false } },
        ],
      };
    }

    if (status && status === "active" ? "active" : "inactive") {
      query.status = status;
    }

    if (search && String(search).trim()) {
      const s = String(search).trim();
      const regex = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [
        { name: regex },
        { "productKeys.stripe": regex },
        { spInUsd: regex }
      ];
    }

    const total = await PremiumPlan.countDocuments(query);

    const baseQuery = PremiumPlan.find(query).sort({
      isPopular: -1,
      createdAt: 1,
    });

    const plans = hasPagination
      ? await baseQuery.skip((pageNum - 1) * limitNum).limit(limitNum)
      : await baseQuery;

    return res.status(200).json({
      status: true,
      message: plans.length ? "Plans fetched successfully" : "No plans found",
      plans,
      total: hasPagination ? total : plans.length,
      pagination: hasPagination
        ? {
            page: pageNum,
            limit: limitNum,
            total,
            hasNextPage: pageNum * limitNum < total,
          }
        : undefined,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};


// Helper: infer plan kind from plan validityType or name
function getPlanKindFromPlan(plan) {
  const vType = (plan.validityType || "").toLowerCase();
  if (vType === "yearly" || vType === "year") return "yearly";
  if (vType === "monthly" || vType === "month") return "monthly";
  if (vType === "free") return "free";
  
  // Fallback to name-based heuristic for legacy plans
  const t = (plan.name || "").toLowerCase();
  if (t.includes("year") || t.includes("annual")) return "yearly";
  if (t.includes("month")) return "monthly";
  return "free";
}

// Helper: whether a coupon applies to this plan kind
function couponAppliesToPlan(couponPlanType, planKind) {
  if (planKind === "free") return false;
  if (couponPlanType === "all") return true;
  return couponPlanType === planKind;
}

// Helper: check if plan is recurring (monthly or yearly subscription)
function isRecurringPlan(plan) {
  const planKind = getPlanKindFromPlan(plan);
  return planKind === "yearly" || planKind === "monthly";
}

// Create Stripe Checkout Session for a selected plan
// For recurring plans (monthly/yearly): creates subscription mode (auto-renewing)
// For one-time plans: creates payment mode (single charge)
exports.createCheckoutSession = async (req, res) => {
  try {
    const { product_id, successUrl, cancelUrl, email, token, promoCode } = req.body || {};

    if (!product_id || !successUrl || !cancelUrl) {
      return res.status(400).json({
        status: false,
        message: "product_id, successUrl and cancelUrl are required",
      });
    }

    const plan = await PremiumPlan.findOne({ "productKeys.stripe": product_id });
    if (!plan) {
      return res.status(404).json({
        status: false,
        message: "PremiumPlan not found for the provided product_id",
      });
    }

    const planKind = getPlanKindFromPlan(plan);
    const useSubscriptionMode = isRecurringPlan(plan);

    // Ensure we have a Stripe customer for first-time and renewal (so customerId is never null in DB)
    let stripeCustomerId = null;
    let userIdForInitiation = null;
    const emailTrimmed = (email || "").trim().toLowerCase();
    if (emailTrimmed) {
      const existingUser = await User.findOne({ email: emailTrimmed }).select("_id plan").lean();
      if (existingUser) {
        userIdForInitiation = existingUser._id;
        if (existingUser?.plan?.customerId) {
          stripeCustomerId = existingUser.plan.customerId;
        }
      }
      if (!stripeCustomerId) {
        const newCustomer = await stripe.customers.create({
          email: emailTrimmed,
          metadata: { source: "signup_checkout" },
        });
        stripeCustomerId = newCustomer.id;
      }
    }

    let sessionConfig = {};
    let stripeCouponId = null;

    if (useSubscriptionMode) {
      // Subscription mode: use Stripe product's recurring price for auto-renewal
      let priceId = null;
      try {
        const stripeProduct = await stripe.products.retrieve(product_id, { expand: ["default_price"] });
        const defaultPrice = stripeProduct.default_price;
        if (defaultPrice && (typeof defaultPrice === "object" ? defaultPrice.recurring : true)) {
          priceId = typeof defaultPrice === "string" ? defaultPrice : (defaultPrice?.id || null);
        }
      } catch (e) {
        console.warn("Could not retrieve Stripe product default price, using price_data:", e.message);
      }

      // Apply promo for subscription: create/find Stripe coupon
      let appliedPromoCode = null;
      if (promoCode && String(promoCode).trim()) {
        const code = String(promoCode).trim().toUpperCase();
        const coupon = await Coupon.findOne({ couponCode: code });
        if (coupon && couponAppliesToPlan(coupon.planType, planKind)) {
          try {
            const existingCoupons = await stripe.coupons.list({ limit: 100 });
            const match = existingCoupons.data.find((c) => c.metadata?.ourCouponCode === code);
            if (match) {
              stripeCouponId = match.id;
            } else {
              const newStripeCoupon = await stripe.coupons.create({
                percent_off: coupon.discountPercent,
                duration: "once",
                name: code,
                metadata: { ourCouponCode: code },
              });
              stripeCouponId = newStripeCoupon.id;
            }
            appliedPromoCode = code;
          } catch (couponErr) {
            console.warn("Stripe coupon creation failed, proceeding without promo:", couponErr.message);
          }
        }
      }

      const lineItem = priceId
        ? { price: priceId, quantity: 1 }
        : {
            price_data: {
              currency: "usd",
              product: product_id,
              unit_amount: Math.round(parseFloat(plan.spInUsd || "0") * 100),
              recurring: {
                interval: planKind === "yearly" ? "year" : "month",
              },
            },
            quantity: 1,
          };

      sessionConfig = {
        mode: "subscription",
        line_items: [lineItem],
        success_url: successUrl,
        cancel_url: cancelUrl,
        subscription_data: {
          metadata: {
            product_id,
            email: emailTrimmed || "",
            // signupToken: token || "",
            ...(appliedPromoCode && { promoCode: appliedPromoCode }),
          },
        },
        metadata: {
          product_id,
          email: emailTrimmed || "",
          // signupToken: token || "",
          ...(appliedPromoCode && { promoCode: appliedPromoCode }),
        },
      };
      if (stripeCouponId) {
        sessionConfig.discounts = [{ coupon: stripeCouponId }];
      }
    } else {
      // One-time payment mode (for One-time / Free plans)
      let unitPrice = parseFloat(plan.spInUsd || "0");
      let appliedPromoCode = null;

      if (promoCode && String(promoCode).trim()) {
        const code = String(promoCode).trim().toUpperCase();
        const coupon = await Coupon.findOne({ couponCode: code });
        if (coupon && couponAppliesToPlan(coupon.planType, planKind)) {
          unitPrice = unitPrice * (1 - coupon.discountPercent / 100);
          appliedPromoCode = code;
        }
      }

      const amountCents = Math.round(unitPrice * 100);

      sessionConfig = {
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: plan.name || "Subscription PremiumPlan",
                ...(appliedPromoCode && {
                  description: `Price after promo discount (code: ${appliedPromoCode})`,
                }),
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          product_id,
          email: emailTrimmed || "",
          // signupToken: token || "",
          ...(appliedPromoCode && { promoCode: appliedPromoCode }),
        },
      };
    }

    if (stripeCustomerId) {
      sessionConfig.customer = stripeCustomerId;
    } else if (emailTrimmed) {
      sessionConfig.customer_email = emailTrimmed;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    // Record checkout initiation for incomplete payments analytics (server-side, from Stripe)
    try {
      await CheckoutInitiation.create({
        sessionId: session.id,
        email: emailTrimmed || "",
        product_id: product_id,
        planId: plan._id,
        country: plan.country || null,
        userId: userIdForInitiation,
      });
    } catch (initErr) {
      console.error("CheckoutInitiation record failed (non-blocking):", initErr.message);
    }

    return res.status(200).json({
      status: true,
      message: "Checkout session created",
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

/**
 * Create a Stripe subscription for the free plan server-side (no redirect).
 * User stays on signup flow; Stripe webhooks still fire (customer.subscription.created, invoice.paid).
 */
exports.createFreeSubscription = async (req, res) => {
  try {
    const { product_id, email, token } = req.body || {};

    if (!product_id || !email || !token) {
      return res.status(400).json({
        status: false,
        message: "product_id, email and token are required",
      });
    }

    let decodedToken;
    try {
      decodedToken = jwtUtils.verifyToken(token);
    } catch (e) {
      return res.status(400).json({
        status: false,
        message: e.message || "Invalid or expired token",
      });
    }

    const tokenEmail = (decodedToken.email || "").trim().toLowerCase();
    if (tokenEmail !== (email || "").trim().toLowerCase()) {
      return res.status(403).json({
        status: false,
        message: "Email does not match token",
      });
    }

    const plan = await PremiumPlan.findOne({ "productKeys.stripe": product_id });
    if (!plan) {
      return res.status(404).json({
        status: false,
        message: "PremiumPlan not found for the provided product_id",
      });
    }

    const planKind = getPlanKindFromPlan(plan);
    if (planKind !== "free") {
      return res.status(400).json({
        status: false,
        message: "This endpoint is only for 'Free' plans",
      });
    }

    const emailTrimmed = (email || "").trim().toLowerCase();
    const user = await User.findOne({ email: emailTrimmed }).lean();
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found for this email",
      });
    }

    let stripeCustomerId = user?.plan?.customerId;
    if (!stripeCustomerId) {
      const newCustomer = await stripe.customers.create({
        email: emailTrimmed,
        metadata: { source: "signup_free_subscription" },
      });
      stripeCustomerId = newCustomer.id;
    }

    // Stripe subscription price_data requires 'product' (id), not 'product_data'. Get or create a Stripe product.
    let stripeProductId = null;
    try {
      const existing = await stripe.products.retrieve(product_id);
      stripeProductId = existing.id;
    } catch (e) {
      if (e.code === "resource_missing" || e.statusCode === 404) {
        const newProduct = await stripe.products.create({
          name: plan.name || "Free PremiumPlan",
          metadata: { product_id, plan_type: "free" },
        });
        stripeProductId = newProduct.id;
      } else {
        throw e;
      }
    }

    const subscriptionConfig = {
      customer: stripeCustomerId,
      items: [
        {
          price_data: {
            currency: "usd",
            product: stripeProductId,
            recurring: { interval: "month" },
            unit_amount: 0,
          },
          quantity: 1,
        },
      ],
      metadata: {
        product_id,
        email: emailTrimmed,
        plan_type: "free",
      },
      expand: ["latest_invoice"],
    };

    const subscription = await stripe.subscriptions.create(subscriptionConfig);

    const planType = "free";
    const userForUpdate = { ...user, subscriptionExpiry: null, planType };
    await updateUserSubscription(userForUpdate, planType);

    const updateOp = {
      $set: {
        planType: "free",
        lastSubscriptionPurchase: new Date(),
        "plan.customerId": stripeCustomerId,
        "plan.status": "active",
        "plan.subscriptionId": subscription.id,
        subscriptionExpiry: null,
      },
    };
    await User.findOneAndUpdate({ _id: user._id }, updateOp);

    const planId = plan._id;
    const countryCode = plan.country || user.country || null;
    const transactionData = {
      sessionId: subscription.id,
      email: emailTrimmed,
      userId: user._id,
      planId,
      amount_total: 0,
      currency: "usd",
      status: "paid",
      payment_intent: subscription.latest_invoice?.payment_intent || "",
      customer_email: emailTrimmed,
      customer_name: user.fullName || "",
      endTime: null,
      planType: "free",
      country: countryCode,
      stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      raw: { subscriptionId: subscription.id, source: "create_free_subscription" },
    };
    const transaction = new Transaction(transactionData);
    await transaction.save();

    try {
      const now = new Date();
      const dateStr = [
        String(now.getDate()).padStart(2, "0"),
        String(now.getMonth() + 1).padStart(2, "0"),
        now.getFullYear(),
      ].join("-");
      await incrementAnalytics({
        eventType: "total_subscription_success",
        country: countryCode || "",
        plan: planType,
        date: dateStr,
        transactionId: transaction._id,
      });
    } catch (analyticsErr) {
      console.error("Analytics increment total_subscription_success failed:", analyticsErr.message);
    }

    return res.status(200).json({
      status: true,
      message: "Free subscription activated",
      subscriptionId: subscription.id,
    });
  } catch (error) {
    console.error("createFreeSubscription error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server error",
    });
  }
};

// Stripe webhook handler for payment success/failure
exports.handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  console.log("[Webhook] Received Stripe webhook request");

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    console.log("[Webhook] Signature verified, event type:", event.type);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Handle checkout.session.completed event
    if (event.type === "checkout.session.completed") {
      console.log("[Webhook] Processing checkout.session.completed");
      const session = event.data.object;
      const metadata = session.metadata || {};

      // Store transaction data (regardless of payment status)
      const email = (metadata.email || session.customer_details?.email || "")
        .toLowerCase()
        .trim();
      // const signupToken = (metadata.signupToken || "").trim();
      const productId = metadata.product_id || "";

      console.log("[Webhook] Metadata extracted - email:", email, "productId:", productId);

      // Get plan details only to determine planType (yearly/monthly) - no Stripe dates used
      let planType = null;
      let countryCode = null;
      let planId = null; // Store plan _id for transaction

      if (productId) {
        const plan = await PremiumPlan.findOne({ "productKeys.stripe": productId });
        if (plan) {
          planId = plan._id;
          planType = getPlanKindFromPlan(plan);
          if (plan.country) countryCode = plan.country;
          console.log("[Webhook] PremiumPlan found - planType:", planType);
        } else {
          planType = "free";
          console.log("[Webhook] PremiumPlan not found, defaulting to free");
        }
      }

      // Fetch user from users collection only (for transaction userId and country)
      let userId = null;
      if (email) {
        console.log("[Webhook] Fetching user by email from users collection:", email);
        const userForTx = await User.findOne({ email: email });
        if (userForTx) {
          userId = userForTx._id;
          console.log("[Webhook] User found, userId:", userId);
          if (!countryCode && userForTx.country) {
            countryCode = userForTx.country;
          }
        } else {
          console.log("[Webhook] User not found for email:", email);
        }
      }

      // Try to get country from metadata if still not found
      if (!countryCode && metadata.country) {
        countryCode = metadata.country.trim();
      }

      const transactionData = {
        sessionId: session.id,
        email: email,
        userId: userId,
        planId: planId,
        amount_total: session.amount_total || 0,
        currency: session.currency || "usd",
        status: session.payment_status || "unknown",
        payment_intent: session.payment_intent || "",
        customer_email: session.customer_details?.email || email,
        customer_name: session.customer_details?.name || "",
        endTime: null, // not using Stripe/transaction date for expiry; user expiry is extended from users collection only
        planType: planType,
        country: countryCode,
        stripeCustomerId: session.customer || null,
        stripeSubscriptionId: session.subscription || null,
        raw: session,
      };
      console.log("[Webhook] Transaction data:", JSON.stringify(transactionData, null, 2));
      // Save the new transaction
      const transaction = new Transaction(transactionData);
      await transaction.save();
      console.log("[Webhook] Transaction saved, id:", transaction._id);

      // Only process subscription update if payment was successful
      if (session.payment_status === "paid") {
        console.log("[Webhook] Payment status is paid - processing subscription update");
        // Increment analytics for total_subscription_success (once per paid transaction)
        const now = new Date();
        const dateStr = [
          String(now.getDate()).padStart(2, "0"),
          String(now.getMonth() + 1).padStart(2, "0"),
          now.getFullYear()
        ].join("-");
        try {
          const analyticsResponse = await incrementAnalytics({
            eventType: "total_subscription_success",
            country: countryCode || "",
            plan: planType || "",
            date: dateStr,
            transactionId: transaction._id
          });
          console.log("Analytics total_subscription_success response:", analyticsResponse);
        } catch (analyticsErr) {
          console.error("Analytics increment total_subscription_success failed:", analyticsErr.message);
        }

        // Update user: payment done, planType (yearly/monthly), userId. Extend subscriptionExpiry from users collection only (no Stripe/transaction dates).
        if (!email) {
          console.log("[Webhook] No email, skipping user update");
        } else if (planType !== "yearly" && planType !== "monthly") {
          console.log("[Webhook] PremiumPlan type is not yearly/monthly, skipping expiry extension. planType:", planType);
        } else {
          const user = await User.findOne({ email: email }).lean();
          if (!user) {
            console.error("[Webhook] User not found in users collection for email:", email);
          } else {
            const userId = user._id;
            const currentExpiry = user.subscriptionExpiry
              ? new Date(user.subscriptionExpiry.getTime ? user.subscriptionExpiry.getTime() : user.subscriptionExpiry)
              : null;
            console.log("[Webhook] Payment done. userId:", userId, "planType:", planType, "current subscriptionExpiry from users collection:", currentExpiry);

            // Extend from current expiry (or from now if none/expired); no Stripe date used
            const userForUpdate = { ...user, subscriptionExpiry: currentExpiry, planType };
            const userResponse = await updateUserSubscription(userForUpdate, planType);
            const newExpiry = userResponse.subscriptionExpiry;
            console.log("[Webhook] Extended by", planType === "yearly" ? "1 year" : "1 month", "-> new subscriptionExpiry:", newExpiry);

            const updateOp = {
              $set: {
                planType: userResponse.planType,
                lastSubscriptionPurchase: new Date(),
                "plan.customerId": session.customer || user.plan?.customerId,
                "plan.status": "active",
                subscriptionExpiry: newExpiry,
              },
            };
            if (session.subscription) {
              updateOp.$set["plan.subscriptionId"] = session.subscription;
            }
            await User.findOneAndUpdate({ _id: userId }, updateOp);
            console.log("[Webhook] User updated in users collection:", userId);
          }
        }
      } else {
        console.log("[Webhook] Payment status is not paid, skipping subscription update. Status:", session.payment_status);
      }
    }

    // Extra Stripe webhooks (disabled on Stripe dashboard for subscription flow). Comment these blocks back out if subscriptionExpiry gets overwritten when these events are enabled.
    if (event.type === "payment_intent.succeeded") {
      console.log("[Webhook] Processing payment_intent.succeeded");
      const paymentIntent = event.data.object;
      // You can add additional logic here if needed
    }

    if (event.type === "payment_intent.payment_failed") {
      console.log("[Webhook] Processing payment_intent.payment_failed");
      const paymentIntent = event.data.object;
      console.error("Payment failed:", paymentIntent.id);
      // You can add failure handling logic here if needed
    }

    if (event.type === "invoice.paid") {
      console.log("[Webhook] Processing invoice.paid");
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;
      const billingReason = invoice.billing_reason;
      const amountPaid = invoice.amount_paid || 0;

      // First invoice for a new subscription (e.g. free plan created server-side)
      if (subscriptionId && billingReason === "subscription_create") {
        console.log("[Webhook] invoice.paid - new subscription, subscriptionId:", subscriptionId, "amount_paid:", amountPaid);
        try {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
          const metadata = subscription.metadata || {};
          const planTypeFromMeta = metadata.plan_type === "free" ? "free" : null;

          const updatePayload = {
            "plan.status": "active",
            "plan.subscriptionId": subscription.id,
          };
          if (customerId) updatePayload["plan.customerId"] = customerId;
          if (planTypeFromMeta) {
            updatePayload.planType = planTypeFromMeta;
            updatePayload.subscriptionExpiry = null;
          }

          const filter = customerId
            ? { "plan.customerId": customerId }
            : { email: (metadata.email || "").trim().toLowerCase() };
          const hasFilter = customerId || (metadata.email && metadata.email.trim());
          if (hasFilter) {
            await User.findOneAndUpdate(filter, { $set: updatePayload });
            console.log("[Webhook] invoice.paid (subscription_create) - plan updated for customer", customerId);
          }
        } catch (err) {
          console.error("invoice.paid (subscription_create) handler error:", err.message);
        }
      }

      // Renewal (existing logic)
      if (subscriptionId && billingReason === "subscription_cycle") {
        console.log("[Webhook] invoice.paid - renewal, subscriptionId:", subscriptionId);
        try {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const customerId = subscription.customer;
          await User.findOneAndUpdate(
            { "plan.customerId": customerId },
            { $set: { "plan.status": "active" } }
          );
          console.log("[Webhook] invoice.paid - plan.status set active for customer", customerId);
        } catch (err) {
          console.error("invoice.paid handler error:", err.message);
        }
      }
    }

    if (event.type === "customer.subscription.created") {
      console.log("[Webhook] Processing customer.subscription.created");
      const subscription = event.data.object;
      if (subscription.status === "active") {
        try {
          const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
          const metadata = subscription.metadata || {};
          const planTypeFromMeta = metadata.plan_type === "free" ? "free" : null;

          const updatePayload = {
            "plan.status": "active",
            "plan.subscriptionId": subscription.id,
          };
          if (customerId) updatePayload["plan.customerId"] = customerId;
          if (planTypeFromMeta) {
            updatePayload.planType = planTypeFromMeta;
            updatePayload.subscriptionExpiry = null;
          }

          await User.findOneAndUpdate(
            { "plan.customerId": customerId },
            { $set: updatePayload }
          );
          console.log("[Webhook] customer.subscription.created - plan updated for customer", customerId);
        } catch (err) {
          console.error("customer.subscription.created handler error:", err.message);
        }
      }
    }

    if (event.type === "customer.subscription.updated") {
      console.log("[Webhook] Processing customer.subscription.updated");
      const subscription = event.data.object;
      if (subscription.status === "active") {
        try {
          const customerId = subscription.customer;
          await User.findOneAndUpdate(
            { "plan.customerId": customerId },
            {
              $set: {
                "plan.status": "active",
                "plan.subscriptionId": subscription.id,
              }
            }
          );
          console.log("[Webhook] customer.subscription.updated - plan updated for customer", customerId);
        } catch (err) {
          console.error("customer.subscription.updated handler error:", err.message);
        }
      }
    }

    if (event.type === "customer.subscription.deleted") {
      console.log("[Webhook] Processing customer.subscription.deleted");
      const subscription = event.data.object;
      try {
        const customerId = subscription.customer;
        console.log("[Webhook] customer.subscription.deleted - canceling for customerId:", customerId);
        await User.findOneAndUpdate(
          { "plan.customerId": customerId },
          { $set: { "plan.status": "canceled", "plan.subscriptionId": null } }
        );
        console.log("[Webhook] customer.subscription.deleted - Subscription canceled for customer", customerId);
      } catch (err) {
        console.error("customer.subscription.deleted handler error:", err.message);
      }
    }

    console.log("[Webhook] Completed successfully, event type:", event.type, "id:", event.id);
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook processing failed:", error);
    return res.status(500).json({
      error: "Webhook handler failed",
      message: error.message,
    });
  }
};

// Create password controller
exports.createPassword = async (req, res) => {
  try {
    const { token, password, phoneCode, phoneNumber } = req.body;

    if (!token) {
      return res.status(200).json({
        status: false,
        message: "Token is required.",
      });
    }

    const decodedToken = jwtUtils.verifyToken(token);
    const email = decodedToken.email;
    if (!email) {
      return res.status(200).json({
        status: false,
        message: "Email not found in token.",
      });
    }

    if (!password) {
      return res.status(200).json({
        status: false,
        message: "Password is required.",
      });
    }

    // Validate password length
    if (password.length < 6 || password.length > 60) {
      return res.status(200).json({
        status: false,
        message: "Password must be between 6 and 60 characters.",
      });
    }

    // Find subscription by token
    const subscription = await User.findOne({ email: email });

    if (!subscription) {
      return res.status(200).json({
        status: false,
        message: "Invalid email.",
      });
    }

    // Check if user is subscribed
    if (!subscription.planType) {
      return res.status(200).json({
        status: false,
        message: "Please complete subscription payment first.",
      });
    }

    // Store password as plain text (not hashed)
    // Update subscription with password and set passwordCreated to true
    subscription.password = password;
    subscription.passwordCreated = true;

    // Save phone code and phone number separately if provided
    if (phoneNumber != null && String(phoneNumber).trim() !== "") {
      const digitsOnly = String(phoneNumber).replace(/\D/g, "");
      if (digitsOnly.length >= 8 && digitsOnly.length <= 15) {
        subscription.phoneNumber = digitsOnly;
        subscription.markModified("phoneNumber");
      }
    }
    if (phoneCode != null && String(phoneCode).trim() !== "") {
      const code = String(phoneCode).trim();
      if (/^\+?[0-9]{1,4}$/.test(code.replace(/\s/g, ""))) {
        subscription.phoneCode = code.startsWith("+") ? code : "+" + code;
        subscription.markModified("phoneCode");
      }
    }

    await subscription.save();

    return res.status(200).json({
      status: true,
      message: "Password created successfully.",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

// Get transactions by email
exports.getTransactionsByEmail = async (req, res) => {
  try {
    if (!req.body.email) {
      return res.status(200).json({
        status: false,
        message: "Email is required in request body",
      });
    }

    const requestedEmail = req.body.email.trim().toLowerCase();

    // Security check: Ensure user can only access their own transactions
    // Fetch user from database to get their email
    if (req.user && req.user.userId) {
      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(401).json({
          status: false,
          message: "User not found",
        });
      }

      // Check if requested email matches authenticated user's email
      if (user.email && user.email.toLowerCase() !== requestedEmail) {
        return res.status(403).json({
          status: false,
          message: "You can only access your own transactions",
        });
      }
    }

    // Find all transactions with the given email
    const transactions = await Transaction.find({ email: requestedEmail }).sort(
      { createdAt: -1 }
    );

    if (!transactions || transactions.length === 0) {
      return res.status(200).json({
        status: true,
        message: "No transactions found for this email",
        data: [],
        count: 0,
      });
    }

    // Convert mongoose documents to plain objects
    const transactionsData = transactions.map((transaction) => {
      const transactionObj = transaction.toObject
        ? transaction.toObject()
        : transaction;
      return transactionObj;
    });

    console.log(
      `📧 Found ${transactions.length} transaction(s) for email: ${requestedEmail}`
    );

    return res.status(200).json({
      status: true,
      message: "Transactions retrieved successfully",
      data: transactionsData,
      count: transactions.length,
    });
  } catch (error) {
    console.error("Error getting transactions by email:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message || "Internal Server error",
    });
  }
};

// Get all transactions for admin
exports.getAllTransactions = async (req, res) => {
  try {
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const country = req.query.country;
    const minAmount = req.query.minAmount;
    const maxAmount = req.query.maxAmount;
    const planType = req.query.planType;

    // Build filter query
    let filterQuery = {};

    // Date filter
    if (startDate && endDate && startDate !== "ALL" && endDate !== "ALL") {
      filterQuery.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate + "T23:59:59.999Z"),
      };
    }

    // Country filter
    if (country && country !== "ALL" && country !== "") {
      filterQuery.country = country;
    }

    // Amount range filter
    if ((minAmount && minAmount !== "" && minAmount !== "ALL") || (maxAmount && maxAmount !== "" && maxAmount !== "ALL")) {
      filterQuery.amount_total = {};
      if (minAmount && minAmount !== "" && minAmount !== "ALL") {
        filterQuery.amount_total.$gte = parseFloat(minAmount);
      }
      if (maxAmount && maxAmount !== "" && maxAmount !== "ALL") {
        filterQuery.amount_total.$lte = parseFloat(maxAmount);
      }
    }

    // PremiumPlan type filter
    if (planType && planType !== "ALL" && planType !== "") {
      filterQuery.planType = planType;
    }

    // Aggregate query with lookups
    const transactions = await Transaction.aggregate([
      {
        $match: filterQuery,
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "premiumplans",
          localField: "planId",
          foreignField: "_id",
          as: "plan",
        },
      },
      {
        $unwind: {
          path: "$plan",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $facet: {
          transactions: [
            { $skip: (start - 1) * limit },
            { $limit: limit },
          ],
          pageInfo: [
            { $group: { _id: null, totalRecord: { $sum: 1 } } },
          ],
        },
      },
    ]);

    const total = transactions[0].pageInfo.length > 0 ? transactions[0].pageInfo[0].totalRecord : 0;
    const transactionData = transactions[0].transactions.map((transaction) => ({
      _id: transaction._id,
      sessionId: transaction.sessionId,
      email: transaction.email,
      userName: transaction.user?.fullName || transaction.customer_name || "-",
      planName: transaction.plan?.name || "-",
      amount_total: transaction.amount_total,
      currency: transaction.currency || "usd",
      status: transaction.status,
      payment_intent: transaction.payment_intent || "-",
      customer_email: transaction.customer_email || transaction.email,
      customer_name: transaction.customer_name || transaction.user?.fullName || "-",
      planType: transaction.planType || "-",
      country: transaction.country || "-",
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    }));

    return res.status(200).json({
      status: true,
      message: "Transactions retrieved successfully",
      history: transactionData,
      total: total,
    });
  } catch (error) {
    console.error("Error getting all transactions:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message || "Internal Server error",
    });
  }
};