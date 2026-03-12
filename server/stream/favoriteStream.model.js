const mongoose = require("mongoose");

const favoriteStreamSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    streamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Stream',
      required: true
    }
  },
  {
    timestamps: true,
  }
);

favoriteStreamSchema.index({ userId: 1, streamId: 1 }, { unique: true });

module.exports = mongoose.model("FavoriteStream", favoriteStreamSchema);
