const mongoose = require("mongoose");

const customPageSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["subscription", "paymentPlan"],
      default: "subscription",
      required: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PremiumPlan",
      required: function () {
        return this.type === "paymentPlan";
      },
    },
    mainHeading: { type: String },
    secondaryHeading: { type: String },
    footerText: { type: String },
    disclaimerText: { type: String },
    selectedPlanId: { type: String },

    creative: [
      {
        url: { type: String, required: true },
        type: {
          type: String,
          enum: ["video", "image"],
          default: "image",
        },
        thumbnailUrl: { type: String, default: "" }, // For videos
        order: { type: Number, default: 0 },
      },
    ],

    steps: [
      {
        order: { type: Number, default: 0 },
        title: { type: String, required: true },
        body: { type: String, required: true },
        enabled: { type: Boolean, default: true },
      },
    ],

    socialLinks: [
      {
        platform: { type: String, required: true }, // e.g., "facebook", "instagram", "youtube"
        url: { type: String, required: true },
        iconUrl: { type: String, default: "" }, // Optional custom icon
        order: { type: Number, default: 0 },
      },
    ],

    cta: {
      label: { type: String },
    },
    showUpiTags:{ type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

// Create index on type field for better query performance
customPageSchema.index({ type: 1 });

module.exports = mongoose.model("CustomPage", customPageSchema);
