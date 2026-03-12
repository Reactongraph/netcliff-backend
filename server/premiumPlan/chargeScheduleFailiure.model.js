const mongoose = require("mongoose");

const ChargeScheduleFailiureSchema = new mongoose.Schema(
  {
    paymentGateway: {
      type: String,
      enum: ["Razorpay", "Cashfree"],
      required: true,
    },
    subscriptionId: {
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    nextRetryAt: {
      type: Date,
      required: true,
    },
    scheduleAttemptCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    chargeAttemptCount: {
      type: Number,
    },
    status: {
      type: String,
      enum: ["Pending", "Scheduled", "Abandoned", "Failed"],
      default: "Pending",
    },
    transactionId: {
      type: String,
    },
    premiumPlanHistoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PremiumPlanHistory",
    },
    amount: {
      type: Number,
    },
    failureReason: {
      type: String,
    },
    failureCode: {
      type: String,
    },
    subscriptionCycleCount: { type: Number },
  },
  {
    timestamps: true,
  },
);

// Indexes for efficient querying
ChargeScheduleFailiureSchema.index({ subscriptionId: 1, createdAt: -1 });
ChargeScheduleFailiureSchema.index({ status: 1, nextRetryAt: 1 });
ChargeScheduleFailiureSchema.index({ userId: 1, createdAt: -1 });
ChargeScheduleFailiureSchema.index({ updatedAt: 1, _id: 1 });

module.exports = mongoose.model(
  "ChargeScheduleFailiure",
  ChargeScheduleFailiureSchema,
);
