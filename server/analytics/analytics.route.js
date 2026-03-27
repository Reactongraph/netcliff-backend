const express = require("express");
const route = express.Router();

// Controller
const AnalyticsController = require("./analytics.controller");
const { addOptionalAuthHeader, authorize, jwtAuthenticate, authenticate } = require("../middleware/auth.middleware");
const checkAccessWithSecretKey = require("../../util/checkAccess");

const { userRoles } = require("../../util/helper");

// Increment analytics counters (for both authenticated and anonymous users)
route.post(
  "/increment",
  addOptionalAuthHeader,
  jwtAuthenticate,
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

// Get top performing content (admin only)
route.get(
  "/top-content",
  authenticate,
  authorize([userRoles.ADMIN]),
  AnalyticsController.getTopContent
);

// Get analytics for a specific movie (admin only)
route.get(
  "/movie/:movieId",
  authenticate,
  authorize([userRoles.ADMIN]),
  AnalyticsController.getMovieAnalytics
);

// Get subscribed users (admin only)
route.get(
  "/subscribed-users",
  authenticate,
  authorize([userRoles.ADMIN]),
  AnalyticsController.getSubscribedUsers
);

// Get users subscription analytics (admin only)
route.get(
  "/users",
  authenticate,
  authorize([userRoles.ADMIN]),
  AnalyticsController.getUsersSubscriptionAnalytics
);

// Get subscriptions analytics from premium plan history (admin only)
route.get(
  "/subscriptions",
  authenticate,
  authorize([userRoles.ADMIN]),
  AnalyticsController.getSubscriptionsAnalytics
);

// Get subscriptions chart data - month filter applied (admin only)
route.get(
  "/subscriptions-chart",
  authenticate,
  authorize([userRoles.ADMIN]),
  AnalyticsController.getSubscriptionsChart
);

// Get subscriptions filter options (admin only)
route.get(
  "/subscriptions-filters",
  authenticate,
  authorize([userRoles.ADMIN]),
  AnalyticsController.getSubscriptionsFilters
);

// Get registration analytics (admin only)
route.get(
  "/registrations",
  authenticate,
  authorize([userRoles.ADMIN]),
  AnalyticsController.getRegistrationAnalytics
);

// Get incomplete payments analytics (admin only)
route.get(
  "/incomplete-payments",
  authenticate,
  authorize([userRoles.ADMIN]),
  AnalyticsController.getIncompletePayments
);

// Export current active table (CSV/PDF) and send via email (admin only)
route.post(
  "/export-table",
  authenticate,
  authorize([userRoles.ADMIN]),
  AnalyticsController.exportTable
);

// Get export history (admin only)
route.get(
  "/export-history",
  authenticate,
  authorize([userRoles.ADMIN]),
  AnalyticsController.getExportHistory
);

// Resend export email (admin only)
route.post(
  "/resend-export-email/:id",
  authenticate,
  authorize([userRoles.ADMIN]),
  AnalyticsController.resendExportEmail
);

module.exports = route;