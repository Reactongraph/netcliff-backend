const mongoose = require("mongoose");

const SubtitleSchema = new mongoose.Schema(
  {
    language: { type: mongoose.Schema.Types.ObjectId, ref: "Language" },
    file: { type: String },
    movie: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

SubtitleSchema.index({ movie: 1 });

module.exports = mongoose.model("Subtitle", SubtitleSchema);
