const express = require("express");
const router = express.Router();
const { authenticate, authorize, firebaseAuthenticate } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");
const controllers = require("./tvWatchSession.controller");

router.post(
  "/",
  firebaseAuthenticate,
  authorize([userRoles.USER]),
  controllers.createSession
);

router.put(
  "/",
  firebaseAuthenticate,
  authorize([userRoles.USER]),
  controllers.updateSession
);

// Get channel analytics
router.get(
  "/analytics/channel/:channelId",
  authenticate,
  authorize([userRoles.ADMIN]),
  controllers.getChannelAnalytics
);

module.exports = router; 