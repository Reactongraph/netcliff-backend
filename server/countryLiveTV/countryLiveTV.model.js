const mongoose = require("mongoose");

const countryLiveTVSchema = new mongoose.Schema(
  {
    countryName: { type: String },
    countryCode: { type: String },
    flag: { type: String },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("CountryLiveTV", countryLiveTVSchema);
