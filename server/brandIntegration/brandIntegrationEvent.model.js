const mongoose = require("mongoose");
const { CAMPAIGN_EVENT_TYPES } = require("../../util/constants");

const brandIntegrationEventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: Object.values(CAMPAIGN_EVENT_TYPES),
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false
    },
    sessionId: {
      type: String,
      required: true,
      trim: true
    },
    episodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Episode",
      required: true
    },
    brandIntegrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BrandIntegration",
      required: true
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes for efficient querying and analytics
brandIntegrationEventSchema.index({ eventType: 1 });
brandIntegrationEventSchema.index({ userId: 1 });
brandIntegrationEventSchema.index({ sessionId: 1 });
brandIntegrationEventSchema.index({ episodeId: 1 });
brandIntegrationEventSchema.index({ brandIntegrationId: 1 });
brandIntegrationEventSchema.index({ brandId: 1 });
brandIntegrationEventSchema.index({ timestamp: -1 });

// Compound indexes for common analytics queries
brandIntegrationEventSchema.index({ brandIntegrationId: 1, eventType: 1, timestamp: -1 });
brandIntegrationEventSchema.index({ brandId: 1, eventType: 1, timestamp: -1 });
brandIntegrationEventSchema.index({ episodeId: 1, eventType: 1, timestamp: -1 });

module.exports = mongoose.model("BrandIntegrationEvent", brandIntegrationEventSchema);
