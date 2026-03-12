const mongoose = require("mongoose");

const advertisementSchema = new mongoose.Schema(
  {
    //android
    native: { type: String, default: null },
    interstitial: { type: String, default: null },
    reward: { type: String, default: null },
    banner: { type: String, default: null },

    //ios
    nativeIos: { type: String, default: null },
    rewardIos: { type: String, default: null },
    bannerIos: { type: String, default: null },
    interstitialIos: { type: String, default: null },

    //switch
    isGoogleAdd: { type: Boolean, default: false },
    //isAppAddOnOff: { type: Boolean, default: false },
    //isAddOn: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Advertisement", advertisementSchema);
