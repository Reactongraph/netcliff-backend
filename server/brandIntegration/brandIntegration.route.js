const express = require("express");
const route = express.Router();

// Controller
const controller = require("./brandIntegration.controller");

// Middleware
const { authenticate, authorize, firebaseAuthenticate } = require("../middleware/auth.middleware");
const checkAccessWithSecretKey = require("../../util/checkAccess");
const { userRoles } = require("../../util/helper");

// Public routes (must be before parameterized routes to avoid conflicts)
// Get campaigns for a specific episode
// Supports optional authentication to filter by user subscription
route.get("/campaigns", firebaseAuthenticate, authorize([userRoles.USER]), controller.getCampaignsForEpisode);

// Track brand integration events (impressions, clicks, etc.)
route.post("/events", checkAccessWithSecretKey(), controller.trackEvent);

// Admin routes (protected) - Brand Integration CRUD
route.post("/", authenticate, authorize([userRoles.ADMIN]), controller.create);
route.get("/", authenticate, authorize([userRoles.ADMIN]), controller.getAll);
route.get("/analytics/stats", authenticate, authorize([userRoles.ADMIN]), controller.getAnalytics);
route.put("/:brandIntegrationId/status", authenticate, authorize([userRoles.ADMIN]), controller.updateStatus);
route.get("/:brandIntegrationId", authenticate, authorize([userRoles.ADMIN]), controller.getById);
route.put("/:brandIntegrationId", authenticate, authorize([userRoles.ADMIN]), controller.update);
route.delete("/:brandIntegrationId", authenticate, authorize([userRoles.ADMIN]), controller.delete);

// Note: Brand integrations are now embedded in episode responses automatically
// See /episode/seasonWiseEpisodeAndroid endpoint for episodes with brand integrations

module.exports = route;
