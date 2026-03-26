//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");

//controller
const UserController = require("./user.controller");
const ProfileController = require("./profileManagement.controller");
const { authenticate, jwtAuthenticate, authorize, checkPermissions, firebaseAuthenticate, optionalJwtAuthenticate, addOptionalAuthHeader } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");
const User = require("./user.model");

// Device-id only auth (TEMP): identifies the user by an active session for the given device-id.
// NOTE: This is intentionally limited to specific routes (e.g. GET /profiles) for testing.
const deviceIdOnlyAuthenticate = async (req, res, next) => {
  try {
    const deviceId = req.headers["device-id"];
    if (!deviceId) {
      return res.status(400).json({
        status: false,
        message: "device-id header is required",
        code: "NO_DEVICE_ID",
      });
    }

    const user = await User.findOne({ "sessions.deviceId": deviceId }).select("+sessions");
    if (!user) {
      return res.status(401).json({
        status: false,
        message: "User not found for this device-id",
        code: "DEVICE_NOT_REGISTERED",
      });
    }

    req.user = {
      userId: user._id?.toString(),
      deviceId,
      role: userRoles.USER,
    };

    return next();
  } catch (error) {
    console.error("deviceIdOnlyAuthenticate error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      code: "SERVER_ERROR",
    });
  }
};

//user login and sign up
route.post("/login", checkAccessWithSecretKey(), UserController.store);

//get user profile who login
route.get("/profile", jwtAuthenticate, authorize([userRoles.USER]), UserController.getProfile);

//get all user for admin panel
route.get("/", checkAccessWithSecretKey(), UserController.get);

//update profile of user
route.patch("/update", jwtAuthenticate, authorize([userRoles.USER]), UserController.updateProfile);

//create dummy user
route.post("/dummy", UserController.index);

route.post('/signup', UserController.signup)

// route.post('/new-login', UserController.newLogin)
route.post('/verify-login', UserController.verifyAndLoginSignup)
route.post('/init-login', UserController.initiateLoginSignup)
route.post('/firebase-login', UserController.firebaseLogin)
route.post('/email-login', UserController.emailPasswordLogin)

route.post('/refresh-token', UserController.refreshToken)

// MSG91 Phone OTP endpoints
route.post('/phone-otp/send', checkAccessWithSecretKey(), UserController.sendPhoneOTP)
route.post('/phone-otp/verify', checkAccessWithSecretKey(), UserController.verifyPhoneOTP)
route.post('/phone-otp/resend', checkAccessWithSecretKey(), UserController.resendPhoneOTP)

route.get('/test-session', firebaseAuthenticate, authorize([userRoles.USER]), UserController.testSession)

route.post('/logout', firebaseAuthenticate, authorize([userRoles.USER]), UserController.logout)

//get countryWise user
route.get("/countryWiseUser", authenticate, authorize([userRoles.ADMIN, userRoles.SUB_ADMIN]), checkPermissions(['users.read']), UserController.countryWiseUser);

//user block or unblock
route.patch("/blockUnblock", authenticate, authorize([userRoles.ADMIN, userRoles.SUB_ADMIN]), checkPermissions(['users.write']), UserController.blockUnblock);

//delete user account
route.delete("/deleteUserAccount", authenticate, authorize([userRoles.USER]), UserController.deleteUserAccount);

route.post('/subscription', firebaseAuthenticate, authorize([userRoles.USER]), UserController.createSubscription)
route.post('/subscription/cancel', firebaseAuthenticate, authorize([userRoles.USER]), UserController.cancelSubscription)
route.put('/subscriptions', firebaseAuthenticate, authorize([userRoles.USER]), UserController.updateSubscription);
route.get('/subscriptions/upcoming-invoice', firebaseAuthenticate, authorize([userRoles.USER]), UserController.retrieveUpcomingInvoice);
route.get('/subscriptions/customer-details', firebaseAuthenticate, authorize([userRoles.USER]), UserController.getStripeCustomerDetails)

route.post('/subscription/webhook', express.raw({ type: "application/json" }), UserController.handleStripeWebhook)

// Check free trial status and device usage
route.get('/check-free-trial', checkAccessWithSecretKey(), UserController.checkFreeTrial);

// Start free trial for device or user
route.post('/start-free-trial', addOptionalAuthHeader, firebaseAuthenticate, authorize([userRoles.USER, userRoles.ANONYMOUS]), UserController.startFreeTrial);

// Check if device exists or create guest user
route.post('/check-or-create-device', checkAccessWithSecretKey(), UserController.checkOrCreateDevice);

// Flush Redis cache (admin only)
route.delete('/flush-redis', authenticate, authorize([userRoles.ADMIN, userRoles.SUB_ADMIN]), checkPermissions(['users.delete']), UserController.flushRedis);

// Get attributed users from LinkRunner (admin only)
route.get('/attributed-users',
    // authenticate, authorize([userRoles.ADMIN]), 
    UserController.getAttributedUsers);

// Capture payment event to LinkRunner (admin only)
route.post('/capture-payment', 
    // authenticate, authorize([userRoles.ADMIN]), 
    UserController.capturePaymentEvent);

// Capture custom event to LinkRunner (admin only)
route.post('/capture-event',
    //  authenticate, authorize([userRoles.ADMIN]),
      UserController.captureEventAPI);

// Test GA4 analytics (admin only)
route.post('/test-ga4-purchase',
    // authenticate, authorize([userRoles.ADMIN]),
    UserController.testGA4Purchase);

route.post('/test-ga4-subscription',
    // authenticate, authorize([userRoles.ADMIN]),
    UserController.testGA4Subscription);

// Profile Management Routes
route.post('/profiles', jwtAuthenticate, authorize([userRoles.USER]), ProfileController.createProfile);
// Changed: Now uses JWT authentication to get userId from token
route.get('/profiles', jwtAuthenticate, authorize([userRoles.USER]), ProfileController.getProfiles);
// Changed: Now uses JWT authentication to get userId from token
route.put('/profiles/:profileId', jwtAuthenticate, authorize([userRoles.USER]), ProfileController.updateProfile);
// Changed: Now uses JWT authentication to get userId from token
route.post('/profiles/:profileId/switch', jwtAuthenticate, authorize([userRoles.USER]), ProfileController.switchProfile);
route.delete('/profiles/:profileId', jwtAuthenticate, authorize([userRoles.USER]), ProfileController.deleteProfile);

// Get subscription status
route.get('/subscription/status', jwtAuthenticate, authorize([userRoles.USER]), UserController.getSubscriptionStatus);

// Forgot Password User - Send email 
route.post("/forgetPassword", UserController.forgotPassword);

//validate reset token
route.get("/validateResetToken", UserController.validateResetToken);

//set user password
route.post("/setPassword", UserController.setPassword);

module.exports = route;