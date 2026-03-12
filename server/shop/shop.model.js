const mongoose = require("mongoose");

/**
 * Shop Model
 * Stores saved Aston brand integrations for users/shops
 * Each shop can save multiple Aston campaigns with their details
 */

const savedAstonSchema = new mongoose.Schema({
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BrandIntegration",
    required: false // Allow migration from brandIntegrationId
  },
  // Keep for backward compatibility during migration
  brandIntegrationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BrandIntegration",
    required: false
  },
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
  description: {
    type: String,
    trim: false, // Don't trim to preserve HTML formatting
    default: ""
    // No maxlength limit - can contain rich text/HTML content
  },
  savedAt: {
    type: Date,
    default: Date.now
  },
  // Store placement details for reference
  placementDetails: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { _id: true }); // Enable _id for each saved Aston item

const shopSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true // One shop per user
    },

    // Array of saved Aston campaigns
    savedAstons: {
      type: [savedAstonSchema],
      default: []
    },

    // Metadata
    totalSaved: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes for efficient querying
shopSchema.index({ userId: 1 });
shopSchema.index({ "savedAstons.campaignId": 1 });
shopSchema.index({ "savedAstons.savedAt": -1 });

// Update totalSaved count before saving
shopSchema.pre('save', function (next) {
  // Migrate old brandIntegrationId to campaignId
  if (this.savedAstons && this.savedAstons.length > 0) {
    this.savedAstons.forEach((aston, index) => {
      // If campaignId doesn't exist but brandIntegrationId does, migrate it
      if (!aston.campaignId && aston.brandIntegrationId) {
        aston.campaignId = aston.brandIntegrationId;
      }
      
      // Validate that at least one ID exists
      if (!aston.campaignId && !aston.brandIntegrationId) {
        return next(new Error(`savedAstons[${index}]: Either campaignId or brandIntegrationId is required`));
      }
    });
  }
  
  this.totalSaved = this.savedAstons.length;
  next();
});

// Instance method to check if an Aston is already saved
shopSchema.methods.isAstonSaved = function(campaignId) {
  return this.savedAstons.some(aston => {
    const astonId = aston.campaignId || aston.brandIntegrationId;
    return astonId && astonId.toString() === campaignId.toString();
  });
};

// Instance method to add an Aston
shopSchema.methods.addAston = function(astonData) {
  // Check if already saved
  if (this.isAstonSaved(astonData.campaignId)) {
    throw new Error('This Aston campaign is already saved to your shop');
  }
  
  this.savedAstons.push(astonData);
  return this;
};

// Instance method to remove an Aston by its item ID
shopSchema.methods.removeAstonById = function(itemId) {
  const initialLength = this.savedAstons.length;
  this.savedAstons = this.savedAstons.filter(
    aston => aston._id.toString() !== itemId.toString()
  );
  
  if (this.savedAstons.length === initialLength) {
    throw new Error('Aston item not found in your shop');
  }
  
  return this;
};

// Keep the old method for backward compatibility
shopSchema.methods.removeAston = function(campaignId) {
  const initialLength = this.savedAstons.length;
  this.savedAstons = this.savedAstons.filter(aston => {
    const astonId = aston.campaignId || aston.brandIntegrationId;
    return !astonId || astonId.toString() !== campaignId.toString();
  });
  
  if (this.savedAstons.length === initialLength) {
    throw new Error('Aston campaign not found in your shop');
  }
  
  return this;
};

module.exports = mongoose.model("Shop", shopSchema);
