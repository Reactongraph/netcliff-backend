//express
const express = require("express");
const route = express.Router();

//controller
const controller = require("./widget.controller");
const { authenticate, authorize, firebaseAuthenticate } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");
const checkAccessWithSecretKey = require("../../util/checkAccess");
const { cacheMiddleware } = require("../../util/redisUtils");

// Admin routes (protected)
route.post("/", authenticate, authorize([userRoles.ADMIN]), controller.create);
route.get("/", authenticate, authorize([userRoles.ADMIN]), controller.getAll);
route.get("/:widgetId", authenticate, authorize([userRoles.ADMIN]), controller.getById);
route.put("/:widgetId", authenticate, authorize([userRoles.ADMIN]), controller.update);
route.delete("/:widgetId", authenticate, authorize([userRoles.ADMIN]), controller.delete);
route.put("/:widgetId/toggle-status", authenticate, authorize([userRoles.ADMIN]), controller.toggleStatus);
route.put("/reorder", authenticate, authorize([userRoles.ADMIN]), controller.reorder);


// Public route for widget series with pagination (for mobile app)
// Added Redis caching with TTL of 1 hour (3600 seconds)
route.get(
  "/:widgetId/series/public",
  checkAccessWithSecretKey(),
  cacheMiddleware({
    keyOrGenerator: (req) => req.originalUrl?.replace("?", ":"),
  }),
  controller.getWidgetSeriesPublic
);


// Widget series management routes
route.post("/:widgetId/series", authenticate, authorize([userRoles.ADMIN]), controller.addSeriesToWidget);
route.delete("/:widgetId/series/:seriesId", authenticate, authorize([userRoles.ADMIN]), controller.removeSeriesFromWidget);
route.put("/:widgetId/series/reorder", authenticate, authorize([userRoles.ADMIN]), controller.reorderSeriesInWidget);
route.get("/:widgetId/series", authenticate, authorize([userRoles.ADMIN]), controller.getWidgetWithSeries);

// Public route for active widgets (for frontend)
route.get("/active/list", firebaseAuthenticate, authorize([userRoles.USER]), controller.getActiveWidgets);

module.exports = route; 