const mongoose = require("mongoose");

const seasonSchema = new mongoose.Schema(
  {
    name: { type: String },
    seasonNumber: { type: Number },
    episodeCount: { type: Number },
    image: { type: String },
    releaseDate: { type: String },
    TmdbSeasonId: { type: String, default: null },
    movie: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" },
    updateType: { type: Number, default: 0 }, //0:tmdb 1:manual (handle to convert the image)
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

seasonSchema.index({ movie: 1 });
seasonSchema.index({ seasonNumber: 1 });

module.exports = mongoose.model("Season", seasonSchema);
