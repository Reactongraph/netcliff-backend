const mongoose = require("mongoose");

const likeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" },
    episodeId: { type: mongoose.Schema.Types.ObjectId, ref: "Episode" },
    type: { 
      type: String, 
      enum: ["movie", "tv"], 
      required: true 
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

likeSchema.index({ userId: 1 });
likeSchema.index({ movieId: 1 });
likeSchema.index({ episodeId: 1 });
likeSchema.index({ userId: 1, type: 1 });
likeSchema.index({ updatedAt: 1, _id: 1 });

module.exports = mongoose.model("Like", likeSchema);
