const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      // unique: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PremiumPlan",
      default: null,
    },
    amount_total: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "usd",
    },
    status: {
      type: String,
      required: true,
    },
    signupToken: {
      type: String,
    },
    payment_intent: {
      type: String,
    },
    customer_email: {
      type: String,
    },
    customer_name: {
      type: String,
    },
    endTime: {
      type: Date,
      default: null,
    },
    planType: {
      type: String,
      enum: ['monthly', 'yearly', 'free'],
      default: 'free',
    },
    country: {
      type: String,
      trim: true,
    },
    stripeCustomerId: {
      type: String,
      trim: true,
    },
    stripeSubscriptionId: {
      type: String,
      trim: true,
    },
    flow: {
      type: String,
      enum: ['signup', 'renew'],
      trim: true,
    },
    raw: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Transaction", transactionSchema);

