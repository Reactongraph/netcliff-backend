const mongoose = require("mongoose");

const widgetSchema = new mongoose.Schema(
  {
    title: { 
      type: String, 
      trim: true 
    },
    order: { 
      type: Number, 
      required: true,
      default: 0 
    },
    type: { 
      type: Number, 
      required: true,
      enum: [1, 2, 3, 4, 5],
      // 1: Hero Widget (1:1 Thumbnails), 
      // 2: Top 10 Widget (9:16 Thumbnails), 
      // 3: Small Thumbnails (9:16), 
      // 4: Large Thumbnails (9:16),
      // 5: Grid
    },
    seriesIds: {
      type: [String], // Array of web series IDs
      default: []
    },
    customApi: {
      type: String, // API path/endpoint for custom content
      trim: true
    },
    customApiEnabled: {
      type: Boolean, // Flag to enable/disable custom API
      default: false
    },
    customApiRequiresAuth: {
      type: Boolean, // Flag to indicate if custom API requires logged in user
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    clickAble: {    // For making non clickable widgets
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Index for ordering
widgetSchema.index({ order: 1 });
widgetSchema.index({ type: 1 });
widgetSchema.index({ isActive: 1 });

module.exports = mongoose.model("Widget", widgetSchema); 