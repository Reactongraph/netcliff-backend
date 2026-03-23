const mongoose = require("mongoose");

const SubtitleSchema = new mongoose.Schema(
  {
    language: { type: mongoose.Schema.Types.ObjectId, ref: "Language" },
    file: { type: String },
    movie: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" },
    episode: { type: mongoose.Schema.Types.ObjectId, ref: "Episode" },
    status: { type: String, enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], default: "PUBLISHED" },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

SubtitleSchema.index({ movie: 1 });
SubtitleSchema.index({ episode: 1 });

module.exports = mongoose.model("Subtitle", SubtitleSchema);
