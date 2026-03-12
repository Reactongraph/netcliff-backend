const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" },
    comment: { type: String, default: "" },
    like: { type: Number, default: 0 },
    date: { type: String },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

commentSchema.index({ userId: 1 });
commentSchema.index({ movieId: 1 });

module.exports = mongoose.model("Comment", commentSchema);
