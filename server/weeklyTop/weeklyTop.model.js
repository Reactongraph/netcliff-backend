const mongoose = require("mongoose");

const WeeklyTop = new mongoose.Schema(
  {
    viewCount: { type: Number },
    type: {
      type: String,
      enum: ["movie", "episode"],
      required: true,
    },
    movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" },
    seriesId: { type: mongoose.Schema.Types.ObjectId, ref: "Episode" },
    episodeId: { type: mongoose.Schema.Types.ObjectId, ref: "Episode" },
  },
  {
    versionKey: false,
  }
);

module.exports = mongoose.model("WeeklyTop", WeeklyTop);
