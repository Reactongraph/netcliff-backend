const mongoose = require("mongoose");

const PremiumPlanSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    validity: { type: Number },
    validityType: { type: String },
    price: { type: Number },
    priceStrikeThrough: { type: Number }, // Strike-through price for frontend display
    freeTrialAmount: { type: Number },
    freeTrialDays: { type: Number },
    isDefaultPlan: { type: Boolean, default: false },
    tag: { type: String },
    productKey: { type: String }, // Keep for backward compatibility (GooglePlay)
    productKeys: {
      googlePlay: { type: String },
      appleStore: { type: String },
      razorpay: { type: String },
      cashfree: { type: String },
      stripe: { type: String }
    },
    stripePriceId: { type: String },
    currency: { type: String, default: "INR" },
    country: { type: String, default: "" },
    isPopular: { type: Boolean, default: false },
    mrpInUsd: { type: Number, default: 0 },
    spInUsd: { type: Number, default: 0 },
    planBenefit: { type: Array },
    isAutoRenew: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

PremiumPlanSchema.index({ updatedAt: 1, _id: 1 });

module.exports = mongoose.model("PremiumPlan", PremiumPlanSchema);
