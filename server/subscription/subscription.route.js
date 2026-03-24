//express
const express = require("express");
const route = express.Router();

const { optionalJwtAuthenticate } = require("../middleware/auth.middleware");
//controller
const subscriptionController = require("./subscription.controller");

//middleware
const { jwtAuthenticate, authorize } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//subscribe email - no auth required
route.post("/email", subscriptionController.subscribeEmail);

//renew subscription email - no auth required
route.post("/renew", optionalJwtAuthenticate, subscriptionController.renewSubscription);

//cancel subscription link - JWT required (uses token from header to get email, no body)
route.post("/cancel", jwtAuthenticate, authorize([userRoles.USER]), subscriptionController.cancelSubscriptionLink);

//create Stripe portal session for cancel (from /cancel/token link - no auth, body: { token })
route.post("/create-cancel-portal-session", subscriptionController.createCancelPortalSession);

//verify token - no auth required
route.get("/verify/:token", subscriptionController.verifyToken);

//get plans - no auth required
route.get("/plans", subscriptionController.getPlans);

//parse signup url and return subscription data - no auth required
route.post("/parse-url", subscriptionController.parseSignupUrl);

//get subscription by token - returns all fields - no auth required
route.get("/get-by-token/:token", subscriptionController.getSubscriptionByToken);

//create checkout session for a plan - no auth required
route.post("/checkout", subscriptionController.createCheckoutSession);

//create free plan subscription server-side (no Stripe redirect) - no auth required
route.post("/create-free-subscription", subscriptionController.createFreeSubscription);

//create password - no auth required
route.post("/create-password", subscriptionController.createPassword);

// Stripe webhook - no auth required (raw body handled in index.js)
route.post("/stripe-webhook", subscriptionController.handleStripeWebhook);

// Get transactions by email - JWT auth required
route.post("/transactions-by-email", jwtAuthenticate, authorize([userRoles.USER]), subscriptionController.getTransactionsByEmail);

// Get all transactions for admin - JWT auth required
route.get("/transactions", jwtAuthenticate, authorize([userRoles.ADMIN]), subscriptionController.getAllTransactions);

// Update subscription status by token - no auth required (used after payment)
// route.post("/update-subscription/:token", subscriptionController.updateSubscriptionByToken);

// Mark renew token as used (add to usedRenewTokens) - no auth, called from Signup after successful renew payment
route.post("/mark-renew-token-used", subscriptionController.markRenewTokenUsed);

// Check if renew token is already used (renew flow: skip plan page and show success)
route.post("/check-renew-token-used", subscriptionController.checkRenewTokenUsed);

module.exports = route;

