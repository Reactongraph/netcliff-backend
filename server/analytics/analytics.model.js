const mongoose = require("mongoose");

const Analytics = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: [
        "subscription_plans_view",
        "subscribe_now_click", 
        "subscribe_now_click_user",
        "homepage_view",
        "thumbnail_view",
        "thumbnail_click"
      ],
      required: true
    },
    movieId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Movie",
      required: false
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false
    },
    count: {
      type: Number,
      default: 0,
      required: true
    },
    date: {
      type: Date,
      default: Date.now,
      required: true
    }
  },
  {
    versionKey: false,
    timestamps: true
  }
);

// Event-specific indexes to avoid null value conflicts
// For events without movieId/userId (homepage_view, subscription_plans_view, subscribe_now_click)
Analytics.index(
  { eventType: 1, date: 1 }, 
  { 
    unique: true,
    partialFilterExpression: { 
      movieId: { $exists: false }, 
      userId: { $exists: false } 
    }
  }
);

// For thumbnail events with movieId
Analytics.index(
  { eventType: 1, movieId: 1, date: 1 }, 
  { 
    unique: true,
    partialFilterExpression: { 
      movieId: { $exists: true },
      userId: { $exists: false }
    }
  }
);

// For user-specific events with userId
Analytics.index(
  { eventType: 1, userId: 1, date: 1 }, 
  { 
    unique: true,
    partialFilterExpression: { 
      userId: { $exists: true },
      movieId: { $exists: false }
    }
  }
);

Analytics.index({ date: 1 });
Analytics.index({ updatedAt: 1, _id: 1 });

module.exports = mongoose.model("Analytics", Analytics);