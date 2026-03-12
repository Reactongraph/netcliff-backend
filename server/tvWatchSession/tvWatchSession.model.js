const mongoose = require("mongoose");
const { deviceTypes } = require("./deviceTypes");



const Schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stream",
      required: true,
    },
    watchTime: {
      type: Number, // in milliseconds
      default: 0,
      required: true,
    },
    lastWatchedAt: {
      type: Number, // timestamp
      required: true,
    },
    country: {
      type: String,
      required: true,
    },
    deviceType: {
      type: String,
      enum: deviceTypes,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Index for faster queries
Schema.index({ userId: 1, channelId: 1 });
Schema.index({ createdAt: 1 });
Schema.index({ country: 1 });

module.exports = mongoose.model("TvWatchSession", Schema);
