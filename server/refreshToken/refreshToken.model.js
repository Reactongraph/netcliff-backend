const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: false,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    role: {
      type: String,
      enum: ["ADMIN", "SUB_ADMIN", "CONTENT_CREATOR", "USER"],
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // MongoDB TTL index to auto-delete expired tokens
    },
    isRevoked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Index for faster lookups
refreshTokenSchema.index({ token: 1 });
refreshTokenSchema.index({ adminId: 1 });
refreshTokenSchema.index({ userId: 1 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);

