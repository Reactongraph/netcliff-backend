const express = require("express");
const route = express.Router();

// Controller
const AnalyticsController = require("./analytics.controller");
const { addOptionalAuthHeader, authorize, firebaseAuthenticate, authenticate } = require("../middleware/auth.middleware");
const checkAccessWithSecretKey = require("../../util/checkAccess");

const { userRoles } = require("../../util/helper");

// Increment analytics counters (for both authenticated and anonymous users)
route.post(
  "/increment",
  addOptionalAuthHeader,
  firebaseAuthenticate,
  AnalyticsController.incrementCounter
);

// Bulk increment thumbnail views (for both authenticated and anonymous users)
route.post(
  "/bulk-thumbnail-views",
  checkAccessWithSecretKey(),
  AnalyticsController.bulkIncrementThumbnailViews
);

// Get analytics counters (admin only)
route.get(
  "/counters",
  authenticate,
  authorize([userRoles.ADMIN]),
  AnalyticsController.getCounters
);

// Get analytics summary (admin only)
route.get(
  "/summary",
  authenticate,
  authorize([userRoles.ADMIN]),
  AnalyticsController.getAnalyticsSummary
);

module.exports = route; 