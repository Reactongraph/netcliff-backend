const mongoose = require("mongoose");

const referralSchema = new mongoose.Schema(
  {
    referrerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    refereeUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    rewardedAmount: { type: Number, default: 0 },

    deviceId: {
      type: String,
      default: null,
    },
  },
  { timestamps: true, versionKey: false },
);

module.exports = mongoose.model("Referral", referralSchema);
