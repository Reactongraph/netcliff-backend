const mongoose = require("mongoose");
const {
  CAMPAIGN_TYPES,
  CAMPAIGN_TARGET_LEVELS,
  SUBSCRIPTION_TYPES
} = require("../../util/constants");

const placementSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: Object.values(CAMPAIGN_TYPES),
    required: true
  },

  // Can have multiple targets with different episode configurations
  target: [
    {
      level: {
        type: String,
        enum: Object.values(CAMPAIGN_TARGET_LEVELS),
        required: true
      },
      refId: {
        type: mongoose.Schema.Types.ObjectId,
        required: false // Not required when allLiveSeries is true
      },
      // For SERIES level:
      //   - episodes: "all" -> applies to all episodes
      //   - episodes: [episodeId1, episodeId2] -> applies to specific episodes
      // For EPISODE level: this field is ignored (direct episode targeting)
      episodes: {
        type: mongoose.Schema.Types.Mixed,
        default: null
      },
      // For targeting all live series
      allLiveSeries: {
        type: Boolean,
        default: false
      }
    }
  ],

  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: [20, 'Title cannot exceed 20 characters']
  },
  subtitle: {
    type: String,
    trim: true,
    maxlength: [25, 'Subtitle cannot exceed 25 characters']
  },
  description: {
    type: String,
    trim: false // Don't trim to preserve HTML formatting/whitespace
    // No maxlength limit - can contain rich text/HTML content for product details
  },
  ctaText: {
    type: String,
    trim: true
  },
  displayDurationSec: {
    type: Number,
    required: true
  }
}, { _id: false });

const brandIntegrationSchema = new mongoose.Schema(
  {
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true
    },

    campaignName: {
      type: String,
      required: true,
      trim: true
    },

    campaignURL: {
      type: String,
      required: true,
      trim: true
    },

    brandLogoUrl: {
      type: String,
      required: true,
      trim: true
    },

    priority: {
      type: Number,
      default: 0
    },

    isActive: {
      type: Boolean,
      default: true
    },

    startDate: {
      type: Date,
      required: true
    },

    endDate: {
      type: Date,
      required: true
    },

    // Placements - array of placement configurations
    // Each placement now has its own target
    placements: {
      type: [placementSchema],
      required: true,
      validate: {
        validator: function (placements) {
          return placements && placements.length > 0;
        },
        message: 'At least one placement is required'
      }
    },

    // User category - which subscription types can see this brand integration
    userCategory: {
      type: [String],
      enum: Object.values(SUBSCRIPTION_TYPES),
      default: [SUBSCRIPTION_TYPES.FREE, SUBSCRIPTION_TYPES["FREE-TRAIL"], SUBSCRIPTION_TYPES.PREMIUM],
      required: true
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin"
    }
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes for efficient querying
brandIntegrationSchema.index({ brandId: 1 });
brandIntegrationSchema.index({ isActive: 1 });
brandIntegrationSchema.index({ startDate: 1, endDate: 1 });
brandIntegrationSchema.index({ priority: -1 });
brandIntegrationSchema.index({ "placements.target.refId": 1 });
brandIntegrationSchema.index({ "placements.target.level": 1 });
brandIntegrationSchema.index({ "placements.type": 1 });

// Compound index for the most common query pattern
brandIntegrationSchema.index({
  isActive: 1,
  startDate: 1,
  endDate: 1,
  "placements.target.refId": 1
});

// Validation method for placements
brandIntegrationSchema.methods.validatePlacements = function () {
  const { placements } = this;

  if (!placements || placements.length === 0) {
    throw new Error('At least one placement is required');
  }

  // Track placement types to ensure uniqueness
  const placementTypes = new Set();

  // Validate each placement
  placements.forEach((placement, index) => {
    // Validate required fields
    if (!placement.title) {
      throw new Error(`Placement ${index + 1}: title is required`);
    }

    if (!placement.type) {
      throw new Error(`Placement ${index + 1}: type is required`);
    }

    // Check for unique placement type
    if (placementTypes.has(placement.type)) {
      throw new Error(`Placement ${index + 1}: type '${placement.type}' must be unique within this brand integration`);
    }
    placementTypes.add(placement.type);

    if (!placement.displayDurationSec || placement.displayDurationSec <= 0) {
      throw new Error(`Placement ${index + 1}: displayDurationSec must be a positive number`);
    }

    // Validate targets (now supports multiple targets per placement)
    if (!placement.target || !Array.isArray(placement.target) || placement.target.length === 0) {
      throw new Error(`Placement ${index + 1}: at least one target is required`);
    }

    // Validate each target
    placement.target.forEach((target, targetIndex) => {
      // Validate allLiveSeries targets
      if (target.allLiveSeries) {
        // When allLiveSeries is true, level must be SERIES and refId should not be present
        if (target.level !== 'SERIES') {
          throw new Error(`Placement ${index + 1}, Target ${targetIndex + 1}: allLiveSeries can only be used with SERIES level`);
        }
        // refId is optional when allLiveSeries is true
        if (target.refId) {
          throw new Error(`Placement ${index + 1}, Target ${targetIndex + 1}: refId should not be provided when allLiveSeries is true`);
        }
      } else {
        // For non-allLiveSeries targets, level and refId are required
        if (!target.level || !target.refId) {
          throw new Error(`Placement ${index + 1}, Target ${targetIndex + 1}: level and refId are required`);
        }

        // Target can be EPISODE or SERIES
        if (!['EPISODE', 'SERIES'].includes(target.level)) {
          throw new Error(`Placement ${index + 1}, Target ${targetIndex + 1}: level must be EPISODE or SERIES`);
        }
      }
    });

    // Validate character limits
    if (placement.title && placement.title.length > 20) {
      throw new Error(`Placement ${index + 1}: title cannot exceed 20 characters`);
    }

    if (placement.subtitle && placement.subtitle.length > 25) {
      throw new Error(`Placement ${index + 1}: subtitle cannot exceed 25 characters`);
    }

    // Description can be any length (supports rich text/HTML)
  });

  return true;
};

module.exports = mongoose.model("BrandIntegration", brandIntegrationSchema);
