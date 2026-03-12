const mongoose = require("mongoose");

/**
 * RetryLog: one record per charge (unique paymentId).
 * Tracks status per charge: Initiated -> Failed | Completed.
 * When Initiated succeeds or fails, the same record is updated to current status.
 * No chargeAttemptRaised count (unlike ChargeAttempt).
 */
const RetryLogSchema = new mongoose.Schema(
  {
    paymentId: {
      type: String,
      required: true,
      unique: true,
    },
    paymentGateway: {
      type: String,
      enum: ["Razorpay", "Cashfree"],
      required: true,
    },
    chargeAttemptStatus: {
      type: String,
      enum: ["Initiated", "Completed", "Failed"],
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
    premiumPlanHistoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PremiumPlanHistory",
    },
    amount: { type: Number },
    transactionId: { type: String },
    failureReason: { type: String },
    failureCode: { type: String },
  },
  { timestamps: true }
);

RetryLogSchema.index({ subscriptionId: 1, createdAt: -1 });
RetryLogSchema.index({ userId: 1, createdAt: -1 });
RetryLogSchema.index({ premiumPlanHistoryId: 1 });
RetryLogSchema.index({ chargeAttemptStatus: 1 });

// Required for incremental script for click house
RetryLogSchema.index({ updatedAt: 1, _id: 1 });

module.exports = mongoose.model("RetryLog", RetryLogSchema);
