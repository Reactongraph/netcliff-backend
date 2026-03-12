const mongoose = require("mongoose");

const brandSchema = new mongoose.Schema(
  {
    brandName: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    brandLogoUrl: {
      type: String,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
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

module.exports = mongoose.model("Brand", brandSchema);
