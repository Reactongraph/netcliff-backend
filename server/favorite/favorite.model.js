const mongoose = require("mongoose");

const favoriteSchema = mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" }, // For movies and TV series
    episodeId: { type: mongoose.Schema.Types.ObjectId, ref: "Episode" }, // For TV episodes
    type: { 
      type: String, 
      enum: ["movie", "tv"], 
      required: true 
    }, // Content type
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

favoriteSchema.index({ userId: 1 });
favoriteSchema.index({ movieId: 1 });
favoriteSchema.index({ episodeId: 1 });
favoriteSchema.index({ userId: 1, type: 1 }); // For filtering by user and content type
favoriteSchema.index({ updatedAt: 1, _id: 1 });

module.exports = mongoose.model("Favorite", favoriteSchema);
