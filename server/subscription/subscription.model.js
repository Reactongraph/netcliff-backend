const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    email: { 
      type: String, 
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    tokenExpiresAt: {
      type: Date,
      required: true,
    },
    planType: {
      type: Boolean,
      default: false,
    },
    passwordCreated: {
      type: Boolean,
      default: false,
    },
    password: {
      type: String,
      select: false, // Don't return password by default in queries
    },
    country: {
      type: String,
      default: null,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);

