const mongoose = require("mongoose");

const ChargeAttemptSchema = new mongoose.Schema(
  {
    paymentGateway: {
      type: String,
      enum: ['Razorpay', 'Cashfree'],
      required: true
    },
    chargeAttemptRaised: {
      type: Number,
      required: true,
      min: 1
    },
    chargeAttemptStatus: {
      type: String,
      enum: ['Initiated', 'Completed', 'Failed', 'Abandoned'],
      required: true
    },
    transactionId: {
      type: String
    },
    subscriptionId: {
      type: String,
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    premiumPlanHistoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PremiumPlanHistory"
    },
    amount: {
      type: Number
    },
    paymentId: {
      type: String
    },
    failureReason: {
      type: String
    },
    failureCode: {
      type: String
    },
    subscriptionCycleCount: { type: Number }
  },
  {
    timestamps: true
  }
);

// Indexes for efficient querying
ChargeAttemptSchema.index({ subscriptionId: 1, createdAt: -1 });
ChargeAttemptSchema.index({ userId: 1, createdAt: -1 });
ChargeAttemptSchema.index({ premiumPlanHistoryId: 1 });
ChargeAttemptSchema.index({ paymentId: 1 });
ChargeAttemptSchema.index({ chargeAttemptStatus: 1 });

// Required for incremental script for click house
ChargeAttemptSchema.index({ updatedAt: 1, _id: 1 });

module.exports = mongoose.model("ChargeAttempt", ChargeAttemptSchema);
