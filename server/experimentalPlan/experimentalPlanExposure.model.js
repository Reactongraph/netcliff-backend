const mongoose = require("mongoose");

const ExperimentalPlanExposureSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      unique: true,
    },
    platform: {
      type: String,
      default: "android",
    },
    configId: {
      type: String,
    },
    trialConfigId: {
      type: String,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PremiumPlan",
    },
    experimentKey: {
      type: String,
    },
    variantKey: {
      type: String,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

ExperimentalPlanExposureSchema.index({ updatedAt: 1, _id: 1 });

module.exports = mongoose.model(
  "ExperimentalPlanExposure",
  ExperimentalPlanExposureSchema
);
