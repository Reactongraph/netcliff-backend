const mongoose = require("mongoose");

const TrailerSchema = new mongoose.Schema(
  {
    name: { type: String },
    trailerImage: { type: String },
    videoType: { type: Number, default: 0 }, //0:link 1:video(file),
    videoUrl: { type: String },
    key: { type: String },
    duration: { type: String },
    size: { type: String },
    type: { type: String },
    movie: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" },

    updateType: { type: Number, default: 0 }, //0:tmdb 1:manual (handle to convert the image)
    convertUpdateType: {
      trailerImage: { type: Number, default: 0 },
      videoUrl: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

TrailerSchema.index({ movie: 1 });

module.exports = mongoose.model("Trailer", TrailerSchema);
