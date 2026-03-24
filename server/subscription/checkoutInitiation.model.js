const mongoose = require("mongoose");

const checkoutInitiationSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      default: "",
      lowercase: true,
      trim: true,
    },
    product_id: {
      type: String,
      trim: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PremiumPlan",
      default: null,
    },
    country: {
      type: String,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for date range queries on createdAt
checkoutInitiationSchema.index({ createdAt: 1 });

module.exports = mongoose.model("CheckoutInitiation", checkoutInitiationSchema);
