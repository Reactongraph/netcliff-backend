//express
const express = require("express");
const route = express.Router();

//controller
const ViewedController = require("./viewedContent.controller");
const { addOptionalAuthHeader, authorize, jwtAuthenticate } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");
const { cacheMiddleware } = require("../../util/redisUtils");

// Unified route for both authenticated and anonymous users
route.post(
  "/",
  addOptionalAuthHeader,
  jwtAuthenticate,
  ViewedController.store
);

// Update viewed content end time
route.put(
  "/:viewedContentId",
  addOptionalAuthHeader,
  jwtAuthenticate,
  ViewedController.updateViewedContent
);

// Get continue watching series for widget (similar to widget API response)
route.get(
  '/continue-watching',
  jwtAuthenticate,
  authorize([userRoles.USER]),
  cacheMiddleware({
    keyOrGenerator: (req) => {
      const identifier = req.user?.userId || req.user?.deviceId;
      return identifier ? `continue-watching:${identifier}` : req.originalUrl;
    },
    ttl: process.env.REDIS_TTL_CONTINUE_WATCHING || 86400
  }),
  ViewedController.getContinueWatchingSeries
);

// Get watch history for both authenticated and anonymous users
// Mainly used for my list tab watch history page
route.get('/watch-history', addOptionalAuthHeader, jwtAuthenticate, ViewedController.getWatchHistory);

module.exports = route;
