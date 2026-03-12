const COUPON_STATUS = Object.freeze({
  ACTIVE: "active",
  PENDING: "pending",
  REDEEMED: "redeemed",
  EXPIRED: "expired",
  DISABLED: "disabled",
});

const COUPON_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const COUPON_ERRORS = Object.freeze({
  // Code does not exist
  NOT_FOUND: {
    code: "COUPON_NOT_FOUND",
    message: "invalid coupon code",
  },
  // Code has passed its validity_date
  EXPIRED: {
    code: "COUPON_EXPIRED",
    message: "expired coupon code",
  },
  // Code has already been redeemed (user_id is populated)
  ALREADY_REDEEMED: {
    code: "COUPON_ALREADY_REDEEMED",
    message: "already used coupon code",
  },
  // Code is manually disabled by admin
  DISABLED: {
    code: "COUPON_DISABLED",
    message: "invalid coupon code",
  },
  // Coupon reserved by another user (treat as invalid for this user)
  LOCKED: {
    code: "COUPON_LOCKED",
    message: "invalid coupon code",
  },
  // User has already redeemed a different coupon code
  USER_ALREADY_USED_COUPON: {
    code: "USER_ALREADY_USED_COUPON",
    message: "coupon code only valid for new users",
  },
  // User has an active subscription
  USER_HAS_SUBSCRIPTION: {
    code: "USER_HAS_SUBSCRIPTION",
    message: "coupon code only valid for new users",
  },
  // User has previously taken a free trial
  USER_HAS_USED_FREE_TRIAL: {
    code: "USER_HAS_USED_FREE_TRIAL",
    message: "coupon code only valid for new users",
  },
  // User has an expired or cancelled subscription
  USER_HAS_EXPIRED_OR_CANCELLED_SUBSCRIPTION: {
    code: "USER_HAS_EXPIRED_OR_CANCELLED_SUBSCRIPTION",
    message: "coupon code only valid for new users",
  },
  UNAVAILABLE: {
    code: "COUPON_UNAVAILABLE",
    message: "invalid coupon code",
  },
  PLAN_NOT_FOUND: {
    code: "PLAN_NOT_FOUND",
    message: "invalid coupon code",
  },
  BULK_INSERT_FAILED: {
    code: "BULK_INSERT_FAILED",
    message: "Failed to insert coupons",
  },
  CONFIRM_FAILED: {
    code: "COUPON_CONFIRM_FAILED",
    message: "Could not confirm coupon redemption",
  },
  CANCEL_FAILED: {
    code: "COUPON_CANCEL_FAILED",
    message: "Could not cancel coupon reservation",
  },
});

module.exports = {
  COUPON_STATUS,
  COUPON_LOCK_DURATION_MS,
  COUPON_ERRORS,
};
