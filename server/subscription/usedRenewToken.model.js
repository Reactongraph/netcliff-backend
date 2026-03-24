const mongoose = require("mongoose");

const usedRenewTokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
    },
    usedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

usedRenewTokenSchema.index({ token: 1 });
usedRenewTokenSchema.index({ usedAt: 1 });

module.exports = mongoose.model("UsedRenewToken", usedRenewTokenSchema, "usedRenewTokens");
