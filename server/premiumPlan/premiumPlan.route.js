//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");

//controller
const premiumPlanController = require("./premiumPlan.controller");
const premiumPlanControllerV2 = require("./premiumPlan.controller.v2");
const { authenticate, authorize, firebaseAuthenticate } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//get premiumPlanHistory of particular user (user)
route.get("/planHistoryOfUser", firebaseAuthenticate, authorize([userRoles.USER]), premiumPlanController.planHistoryOfUser);

//create PremiumPlan
route.post("/create", authenticate, authorize([userRoles.ADMIN]), premiumPlanController.store);
route.post("/createPlan", authenticate, authorize([userRoles.ADMIN]), premiumPlanController.createPlan);

//update PremiumPlan
route.patch("/update", authenticate, authorize([userRoles.ADMIN]), premiumPlanController.update);

//make PremiumPlan default
route.patch("/setDefault", authenticate, authorize([userRoles.ADMIN]), premiumPlanController.setDefault);

//delete PremiumPlan
route.delete("/delete", authenticate, authorize([userRoles.ADMIN]), premiumPlanController.destroy);
route.delete("/deletePlan", authenticate, authorize([userRoles.ADMIN]), premiumPlanController.deletePlan);

//toggle PremiumPlan status
route.patch("/toggleStatus", authenticate, authorize([userRoles.ADMIN]), premiumPlanController.toggleStatus);
route.patch("/disablePlan", authenticate, authorize([userRoles.ADMIN]), premiumPlanController.disablePlan);
route.patch("/updatePlanStatus", authenticate, authorize([userRoles.ADMIN]), premiumPlanController.updatePlanStatus);

//get PremiumPlan
route.get("/", checkAccessWithSecretKey(), premiumPlanController.index);

//get PremiumPlan details
route.get("/details", checkAccessWithSecretKey(), premiumPlanController.getPlanDetails);

//create PremiumPlanHistory
route.post("/createHistory", firebaseAuthenticate, authorize([userRoles.USER]), premiumPlanController.createHistory);
// V2 versions
route.post("/v2/createHistory", firebaseAuthenticate, authorize([userRoles.USER]), premiumPlanControllerV2.createHistory);

//get premiumPlanHistory of user (admin)
route.get("/history", authenticate, authorize([userRoles.ADMIN]), premiumPlanController.premiumPlanHistory);

//get charge attempts (admin)
route.get("/chargeAttempts", authenticate, authorize([userRoles.ADMIN]), premiumPlanController.getChargeAttempts);

// Razorpay subscription management routes
route.post("/razorpay/createSubscription", firebaseAuthenticate, authorize([userRoles.USER]), premiumPlanController.createRazorpaySubscription);
route.post("/razorpay/cancelSubscription", firebaseAuthenticate, authorize([userRoles.USER]), premiumPlanController.cancelRazorpaySubscription);
route.get("/razorpay/subscription/:subscriptionId", authenticate, authorize([userRoles.ADMIN]), premiumPlanController.getRazorpaySubscription);

// Cashfree subscription management routes
route.post("/cashfree/createSubscription", firebaseAuthenticate, authorize([userRoles.USER]), premiumPlanController.createCashfreeSubscription);
route.post("/cashfree/pay", firebaseAuthenticate, authorize([userRoles.USER]), premiumPlanController.authorizeCashfreeSubscription);
route.post("/cashfree/cancelSubscription", firebaseAuthenticate, authorize([userRoles.USER]), premiumPlanController.cancelCashfreeSubscription);
route.get("/cashfree/subscription/:subscriptionId", authenticate, authorize([userRoles.ADMIN]), premiumPlanController.getCashfreeSubscription);
route.get("/cashfree/verifyAuthPayment/:subscriptionId", firebaseAuthenticate, authorize([userRoles.USER]), premiumPlanController.verifyCashfreeSubscriptionAuth);
route.post("/stripe/createSubscription", firebaseAuthenticate, authorize([userRoles.USER]), premiumPlanController.createStripeSubscription);
// V2 versions
route.post("/v2/razorpay/createSubscription", firebaseAuthenticate, authorize([userRoles.USER]), premiumPlanControllerV2.createRazorpaySubscription);

// Webhook routes (no authentication required as they're called by external services)
route.post("/googlePlayWebhook", premiumPlanController.googlePlayWebhook);
route.post("/appleStoreWebhook", premiumPlanController.appleStoreWebhook);
route.post("/razorpayWebhook", premiumPlanController.razorpayWebhook);
route.get("/canceled-subscriptions", checkAccessWithSecretKey(), premiumPlanController.getCanceledRazorpaySubscriptions)
// Analytics APIs
route.get("/analytics/razorpay-records",
  authenticate, authorize([userRoles.ADMIN]),
  premiumPlanController.analyzeRazorpayRecords);
// Development only APIs
route.post("/dev/add-googleplay-subscription", checkAccessWithSecretKey(), premiumPlanController.devAddGooglePlaySubscription);
route.post("/dev/expire-googleplay-subscription", checkAccessWithSecretKey(), premiumPlanController.devExpireGooglePlaySubscription);

module.exports = route;
