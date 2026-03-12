const mongoose = require("mongoose");

const flagSchema = new mongoose.Schema(
  {
    countryName: { type: String },
    flag: { type: String },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Flag", flagSchema);
