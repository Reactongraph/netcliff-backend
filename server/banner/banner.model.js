const mongoose = require("mongoose");

const bannerSchema = new mongoose.Schema(
  {
    image: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      required: true,
      enum: ['auth', 'subscription'],
      default: 'auth'
    },
    order: {
      type: Number,
      required: true,
      default: 0
    },
    isActive: {
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
bannerSchema.index({ order: 1 });
bannerSchema.index({ type: 1 });
bannerSchema.index({ isActive: 1 });

module.exports = mongoose.model("Banner", bannerSchema); 