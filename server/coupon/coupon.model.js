const mongoose = require("mongoose");
const { COUPON_STATUS } = require("./coupon.constants");

const CouponSchema = new mongoose.Schema(
  {
    campaignName: { type: String, required: true },
    campaignSource: { type: String, required: true },
    couponCode: { type: String, required: true, uppercase: true, trim: true },
    premiumplanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PremiumPlan",
      required: true,
    },
    validityDate: { type: Date, required: true },
    status: {
      type: String,
      enum: Object.values(COUPON_STATUS),
      default: COUPON_STATUS.ACTIVE,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    lockedAt: { type: Date, default: null },
    pendingExpiresAt: { type: Date, default: null },
    override: {
      trialDays: { type: Number },
      price: { type: Number },
      duration: { type: Number },
      validityType: { type: String },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

CouponSchema.index({ couponCode: 1 }, { unique: true });
CouponSchema.index({ status: 1 });
CouponSchema.index({ pendingExpiresAt: 1 });
CouponSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model("Coupon", CouponSchema);
