//Mongoose
const mongoose = require("mongoose");

//Role Schema
const roleSchema = new mongoose.Schema(
  {
    name: { type: String },
    image: { type: String },
    position: { type: String },
    movie: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" },

    updateType: { type: Number, default: 0 }, //0:tmdb 1:manual (handle to convert the image)
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

roleSchema.index({ movie: 1 });

module.exports = mongoose.model("Role", roleSchema);
