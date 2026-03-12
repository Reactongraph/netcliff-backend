const mongoose = require("mongoose");

const adBannerSchema = new mongoose.Schema(
  {
    image: {
      type: String,
      required: true,
    },
    contentType: {
      type: String,
      enum: ["movie", "channel", "web-series"],
      required: true,
    },
    contentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    title: { type: String },
    description: { type: String },
    isShow: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("AdBanner", adBannerSchema);
