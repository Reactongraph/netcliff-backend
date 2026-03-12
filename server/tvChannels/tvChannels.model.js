const mongoose = require("mongoose");

const tvChannelsSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'DELETED'],
      default: 'ACTIVE'
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("TvChannels", tvChannelsSchema);
