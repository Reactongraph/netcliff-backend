const mongoose = require("mongoose");

const streamSchema = new mongoose.Schema(
  {
    channelId: { type: String, default: null },
    streamType: { type: String },  // EXTERNAL | INTERNAL
    streamURL: { type: String },

    //Publish Live stream on this url
    streamPublishUrl: { type: String },
    streamKey: { type: String },

    channelName: { type: String },
    description: { type: String },
    channelLogo: { type: String },
    countryCode: { type: String },
    country: { type: String },

    tvChannels: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TvChannel'
    }],

    // additional ---
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Genre' },  // Reference to Genre model
    language: { type: mongoose.Schema.Types.ObjectId, ref: 'Language' },  // Reference to Language model

    // Geography
    continent: { type: mongoose.Schema.Types.ObjectId, ref: 'ContinentRegion' },
    country: { type: mongoose.Schema.Types.ObjectId, ref: 'Region' },
    city: { type: mongoose.Schema.Types.ObjectId, ref: 'City' },

    // Aws -------------
    awsStackId: { type: String },
    awsChannelId: String,
    awsChannelState: { type: String, default: 'stop' }, //stop | start
    awsInputId: String,
    // awsChannelDetails: {
    //   state: String,
    //   name: String,
    //   channelClass: String,
    //   inputAttachments: Array,
    //   destinations: Array,
    //   encoderSettings: Object
    // },
    // awsInputDetails: {
    //   name: String,
    //   type: String,
    //   destinations: Array,
    //   inputSecurityGroups: Array
    // }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Stream", streamSchema);
