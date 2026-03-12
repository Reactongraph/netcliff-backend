const mongoose = require("mongoose");

const downloadSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" },
    type: { type: Number, enum: [1, 2] }, //1.movie 2.episode
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Download", downloadSchema);
