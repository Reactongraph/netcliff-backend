const express = require("express");
const router = express.Router();
const referralController = require("./referral.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

router.post("/", referralController.store);

// Admin: Affiliate analytics + leaderboard
router.get(
  "/analytics",
  authenticate,
  authorize([userRoles.ADMIN]),
  referralController.getAffiliateAnalytics
);

router.get(
  "/leaderboard",
  authenticate,
  authorize([userRoles.ADMIN]),
  referralController.getAffiliateLeaderboard
);

router.get(
  "/history",
  authenticate,
  authorize([userRoles.USER]),
  referralController.getReferralHistory
);

router.get(
  "/stats",
  authenticate,
  authorize([userRoles.USER]),
  referralController.getReferralStats
);

router.get("/validate/:code", referralController.validateReferralCode);

module.exports = router;
