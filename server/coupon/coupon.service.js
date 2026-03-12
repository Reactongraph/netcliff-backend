const mongoose = require("mongoose");
const Coupon = require("./coupon.model");
const PremiumPlan = require("../premiumPlan/premiumPlan.model");
const PremiumPlanHistory = require("../premiumPlan/premiumPlanHistory.model");
const User = require("../user/user.model");
const {
  COUPON_STATUS,
  COUPON_LOCK_DURATION_MS,
  COUPON_ERRORS,
} = require("./coupon.constants");

/**
 * Auto-resets an expired pending coupon back to active.
 * Returns the reset coupon or null if it wasn't in an expired-pending state.
 */
async function resetIfExpiredPending(couponCode) {
  return Coupon.findOneAndUpdate(
    {
      couponCode,
      status: COUPON_STATUS.PENDING,
      pendingExpiresAt: { $lte: new Date() },
    },
    {
      $set: {
        status: COUPON_STATUS.ACTIVE,
        userId: null,
        lockedAt: null,
        pendingExpiresAt: null,
      },
    },
    { new: true }
  );
}

/**
 * Validates a coupon by code.
 * Checks existence, expiry, and status.
 * Auto-resets expired pending coupons.
 */
async function validateCoupon(couponCode) {
  const coupon = await Coupon.findOne({ couponCode });

  if (!coupon) {
    return { valid: false, error: COUPON_ERRORS.NOT_FOUND };
  }

  if (coupon.validityDate < new Date()) {
    if (coupon.status !== COUPON_STATUS.EXPIRED) {
      await Coupon.updateOne(
        { _id: coupon._id },
        { $set: { status: COUPON_STATUS.EXPIRED } }
      );
    }
    return { valid: false, error: COUPON_ERRORS.EXPIRED };
  }

  if (coupon.status === COUPON_STATUS.REDEEMED) {
    return { valid: false, error: COUPON_ERRORS.ALREADY_REDEEMED };
  }

  if (coupon.status === COUPON_STATUS.DISABLED) {
    return { valid: false, error: COUPON_ERRORS.DISABLED };
  }

  if (coupon.status === COUPON_STATUS.EXPIRED) {
    return { valid: false, error: COUPON_ERRORS.EXPIRED };
  }

  if (coupon.status === COUPON_STATUS.PENDING) {
    if (coupon.pendingExpiresAt && coupon.pendingExpiresAt > new Date()) {
      return { valid: false, error: COUPON_ERRORS.LOCKED };
    }
    const reset = await resetIfExpiredPending(couponCode);
    if (!reset) {
      return { valid: false, error: COUPON_ERRORS.UNAVAILABLE };
    }
  }

  const plan = await PremiumPlan.findById(coupon.premiumplanId).lean();
  if (!plan) {
    return { valid: false, error: COUPON_ERRORS.PLAN_NOT_FOUND };
  }

  return {
    valid: true,
    coupon,
    modified_plan: {
      trial_days: coupon.override?.trialDays ?? plan.freeTrialDays ?? 0,
      price: coupon.override?.price ?? plan.price,
      duration: coupon.override?.duration ?? plan.validity,
    },
  };
}

/**
 * Applies a coupon for a user.
 * Checks user eligibility (new users only), then atomically locks the coupon to pending.
 */
async function applyCoupon(userId, couponCode) {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // User has already redeemed a different coupon code
  const existingRedemption = await Coupon.findOne({
    userId: userObjectId,
    status: COUPON_STATUS.REDEEMED,
  }).lean();

  if (existingRedemption) {
    return { success: false, error: COUPON_ERRORS.USER_ALREADY_USED_COUPON };
  }

  // User has an active subscription
  const hasSubscription = await PremiumPlanHistory.exists({
    userId: userObjectId,
    status: { $in: ["active", "pending"] },
  });

  if (hasSubscription) {
    return { success: false, error: COUPON_ERRORS.USER_HAS_SUBSCRIPTION };
  }

  // User has previously taken a free trial
  const user = await User.findById(userObjectId).select("paymentProviderFreeTrialConsumed").lean();
  if (user?.paymentProviderFreeTrialConsumed) {
    return { success: false, error: COUPON_ERRORS.USER_HAS_USED_FREE_TRIAL };
  }

  // User has an expired or cancelled subscription
  const hasExpiredOrCancelledSubscription = await PremiumPlanHistory.exists({
    userId: userObjectId,
    status: { $in: ["expired", "canceled"] },
  });

  if (hasExpiredOrCancelledSubscription) {
    return { success: false, error: COUPON_ERRORS.USER_HAS_EXPIRED_OR_CANCELLED_SUBSCRIPTION };
  }

  const validation = await validateCoupon(couponCode);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const now = new Date();
  const pendingExpiresAt = new Date(now.getTime() + COUPON_LOCK_DURATION_MS);

  const locked = await Coupon.findOneAndUpdate(
    {
      couponCode,
      $or: [
        { status: COUPON_STATUS.ACTIVE },
        {
          status: COUPON_STATUS.PENDING,
          pendingExpiresAt: { $lte: now },
        },
      ],
      validityDate: { $gte: now },
    },
    {
      $set: {
        status: COUPON_STATUS.PENDING,
        userId: new mongoose.Types.ObjectId(userId),
        lockedAt: now,
        pendingExpiresAt,
      },
    },
    { new: true }
  );

  if (!locked) {
    return { success: false, error: COUPON_ERRORS.UNAVAILABLE };
  }

  const plan = await PremiumPlan.findById(locked.premiumplanId).lean();

  return {
    success: true,
    coupon: locked,
    override: {
      price: locked.override?.price ?? plan?.price,
      duration: locked.override?.duration ?? plan?.validity,
      validityType: locked.override?.validityType ?? plan?.validityType,
      trial_days: locked.override?.trialDays ?? plan?.freeTrialDays ?? 0,
      cycles: 1,
    },
  };
}

/**
 * Confirms coupon redemption after successful payment.
 * Atomic: only transitions pending -> redeemed for the matching user.
 */
async function confirmCouponPayment(couponCode, userId) {
  const redeemed = await Coupon.findOneAndUpdate(
    {
      couponCode,
      userId: new mongoose.Types.ObjectId(userId),
      $or: [
        { status: COUPON_STATUS.ACTIVE },
        {
          status: COUPON_STATUS.PENDING,
        },
      ],
    },
    {
      $set: { status: COUPON_STATUS.REDEEMED },
    },
    { new: true },
  );

  if (!redeemed) {
    return { success: false, error: COUPON_ERRORS.CONFIRM_FAILED };
  }

  return { success: true, coupon: redeemed };
}

/**
 * Cancels a coupon reservation after failed/cancelled payment.
 * Atomic: only transitions pending -> active for the matching user.
 */
async function cancelCouponPayment(couponCode, userId) {
  const released = await Coupon.findOneAndUpdate(
    {
      couponCode,
      userId: new mongoose.Types.ObjectId(userId),
      status: COUPON_STATUS.PENDING,
    },
    {
      $set: {
        status: COUPON_STATUS.ACTIVE,
        userId: null,
        lockedAt: null,
        pendingExpiresAt: null,
      },
    },
    { new: true }
  );

  if (!released) {
    return { success: false, error: COUPON_ERRORS.CANCEL_FAILED };
  }

  return { success: true, coupon: released };
}

/**
 * Batch-releases all coupons stuck in pending with an expired lock.
 * Safe for concurrent execution — atomic updateMany.
 */
async function releaseExpiredPendingCoupons() {
  const result = await Coupon.updateMany(
    {
      status: COUPON_STATUS.PENDING,
      pendingExpiresAt: { $lte: new Date() },
    },
    {
      $set: {
        status: COUPON_STATUS.ACTIVE,
        userId: null,
        lockedAt: null,
        pendingExpiresAt: null,
      },
    }
  );

  return { released: result.modifiedCount };
}

/**
 * Bulk-inserts coupon codes for a campaign.
 * Uses ordered:false to skip duplicates without aborting the batch.
 * Processes in chunks of 500 for memory safety.
 */
async function bulkInsertCoupons({
  codes,
  premiumplanId,
  campaignName,
  campaignSource,
  validityDate,
  override,
}) {
  const plan = await PremiumPlan.findById(premiumplanId).lean();
  if (!plan) {
    return { success: false, error: COUPON_ERRORS.PLAN_NOT_FOUND };
  }

  const CHUNK_SIZE = 500;
  let inserted = 0;
  let duplicates = 0;

  for (let i = 0; i < codes.length; i += CHUNK_SIZE) {
    const chunk = codes.slice(i, i + CHUNK_SIZE);

    const documents = chunk.map((code) => ({
      couponCode: code.toUpperCase().trim(),
      premiumplanId: new mongoose.Types.ObjectId(premiumplanId),
      campaignName,
      campaignSource,
      validityDate: new Date(validityDate),
      status: COUPON_STATUS.ACTIVE,
      override: {
        trialDays: override.trialDays,
        price: override.price,
        duration: override.duration,
      },
    }));

    try {
      const result = await Coupon.insertMany(documents, { ordered: false });
      inserted += result.length;
    } catch (err) {
      if (err.code === 11000 || err.name === "BulkWriteError") {
        inserted += err.insertedDocs?.length ?? err.result?.nInserted ?? 0;
        duplicates +=
          chunk.length - (err.insertedDocs?.length ?? err.result?.nInserted ?? 0);
      } else {
        throw err;
      }
    }
  }

  return { success: true, inserted, duplicates, total: codes.length };
}

module.exports = {
  validateCoupon,
  applyCoupon,
  confirmCouponPayment,
  cancelCouponPayment,
  releaseExpiredPendingCoupons,
  bulkInsertCoupons,
};
