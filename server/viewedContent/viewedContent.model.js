const mongoose = require("mongoose");

const ViewedContent = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false  // Made optional for anonymous users
    },
    type: {
      type: String,
      enum: ["movie", "tv"],
      required: true,
    },
    movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" },
    episodeId: { type: mongoose.Schema.Types.ObjectId, ref: "Episode" },
    startTime: {
      // start time in milliseconds
      type: Number,
      required: true,
    },
    endTime: {
      // end time in milliseconds
      type: Number,
      required: true,
    },
    watchTime: {
      // actual watch time in milliseconds (endTime - startTime)
      type: Number,
      required: true,
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
    lastViewedTime: {
      type: Date,
      required: true,
    },
    deviceId: {
      type: String,
      required: true  // Made required for anonymous tracking
    },
    deviceType: { type: String, enum: ["ios", "android", "tv", "web"] },
    subscriptionType: {
      type: String,
      enum: ["PREMIUM", "FREE-TRAIL", "FREE"]
    },
  },
  {
    versionKey: false,
    timestamps: true
  }
);

// Add indexes to optimize query performance
ViewedContent.index({ userId: 1, type: 1, lastViewedTime: -1 });
ViewedContent.index({ deviceId: 1, type: 1, lastViewedTime: -1 });
ViewedContent.index({ subscriptionType: 1, userId: 1 }, { sparse: true });
ViewedContent.index({ subscriptionType: 1, userId: 1, movieId: 1, lastViewedTime: -1 });
ViewedContent.index({ updatedAt: 1, _id: 1 });

module.exports = mongoose.model("ViewedContent", ViewedContent);
