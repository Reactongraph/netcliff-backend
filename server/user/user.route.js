//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");

//controller
const UserController = require("./user.controller");
const { authenticate, authorize, firebaseAuthenticate, addOptionalAuthHeader } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//user login and sign up
route.post("/login", checkAccessWithSecretKey(), UserController.store);

//get user profile who login
route.get("/profile", firebaseAuthenticate, authorize([userRoles.USER]), UserController.getProfile);

//get all user for admin panel
route.get("/", checkAccessWithSecretKey(), UserController.get);

//update profile of user
route.patch("/update", authenticate, authorize([userRoles.USER]), UserController.updateProfile);

//create dummy user
route.post("/dummy", UserController.index);

route.post('/signup', UserController.signup)

// route.post('/new-login', UserController.newLogin)
route.post('/verify-login', UserController.verifyAndLoginSignup)
route.post('/init-login', UserController.initiateLoginSignup)
route.post('/firebase-login', UserController.firebaseLogin)

route.post('/refresh-token', UserController.refreshToken)

// MSG91 Phone OTP endpoints
route.post('/phone-otp/send', checkAccessWithSecretKey(), UserController.sendPhoneOTP)
route.post('/phone-otp/verify', checkAccessWithSecretKey(), UserController.verifyPhoneOTP)
route.post('/phone-otp/resend', checkAccessWithSecretKey(), UserController.resendPhoneOTP)

route.get('/test-session', firebaseAuthenticate, authorize([userRoles.USER]), UserController.testSession)

route.post('/logout', firebaseAuthenticate, authorize([userRoles.USER]), UserController.logout)

//get countryWise user
route.get("/countryWiseUser", authenticate, authorize([userRoles.ADMIN]), UserController.countryWiseUser);

//user block or unblock
route.patch("/blockUnblock", authenticate, authorize([userRoles.ADMIN]), UserController.blockUnblock);

//delete user account
route.delete("/deleteUserAccount", authenticate, authorize([userRoles.USER]), UserController.deleteUserAccount);

route.post('/subscription', firebaseAuthenticate, authorize([userRoles.USER]), UserController.createSubscription)
route.post('/subscription/cancel', firebaseAuthenticate, authorize([userRoles.USER]), UserController.cancelSubscription)
route.put('/subscriptions', firebaseAuthenticate, authorize([userRoles.USER]), UserController.updateSubscription);
route.get('/subscriptions/upcoming-invoice', firebaseAuthenticate, authorize([userRoles.USER]), UserController.retrieveUpcomingInvoice);
route.get('/subscriptions/customer-details', firebaseAuthenticate, authorize([userRoles.USER]), UserController.getStripeCustomerDetails)

route.post('/subscription/webhook', express.raw({ type: "application/json" }), UserController.handleStripeWebhook)

route.get('/adjust/webhook', UserController.handleAdjustWebhook)
route.post('/linkrunner/webhook', UserController.handleLinkRunnerWebhook)

// Check free trial status and device usage
route.get('/check-free-trial', checkAccessWithSecretKey(), UserController.checkFreeTrial);

// Start free trial for device or user
route.post('/start-free-trial', addOptionalAuthHeader, firebaseAuthenticate, authorize([userRoles.USER, userRoles.ANONYMOUS]), UserController.startFreeTrial);

// Check if device exists or create guest user
route.post('/check-or-create-device', checkAccessWithSecretKey(), UserController.checkOrCreateDevice);

// Flush Redis cache (admin only)
route.delete('/flush-redis', authenticate, authorize([userRoles.ADMIN]), UserController.flushRedis);

// Get attributed users from LinkRunner (admin only)
route.get('/attributed-users',
    authenticate, authorize([userRoles.ADMIN]), 
    UserController.getAttributedUsers);

// Capture payment event to LinkRunner (admin only)
route.post('/capture-payment', 
    authenticate, authorize([userRoles.ADMIN]), 
    UserController.capturePaymentEvent);

// Capture custom event to LinkRunner (admin only)
route.post('/capture-event',
     authenticate, authorize([userRoles.ADMIN]),
      UserController.captureEventAPI);

// Test GA4 analytics (admin only)
route.post('/test-ga4-purchase',
    authenticate, authorize([userRoles.ADMIN]),
    UserController.testGA4Purchase);

route.post('/test-ga4-subscription',
    authenticate, authorize([userRoles.ADMIN]),
    UserController.testGA4Subscription);

module.exports = route;
