const mongoose = require("mongoose");

const adjustWebhookRecordSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    phone: { type: String },
    tracker: { type: String },
    campaignName: { type: String },
    networkName: { type: String }
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

adjustWebhookRecordSchema.index({ userId: 1, phone: 1 }, { unique: true });

module.exports = mongoose.model("AdjustWebhookRecord", adjustWebhookRecordSchema);