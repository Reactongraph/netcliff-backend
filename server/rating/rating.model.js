const mongoose = require("mongoose");

const ratingSchema = new mongoose.Schema({
  rating: { type: Number, default: 0 },
  userId: { ref: "User", type: mongoose.Schema.Types.ObjectId },
  movieId: { ref: "Movie", type: mongoose.Schema.Types.ObjectId },
});

ratingSchema.index({ userId: 1 });
ratingSchema.index({ movieId: 1 });

module.exports = mongoose.model("Rating", ratingSchema);
