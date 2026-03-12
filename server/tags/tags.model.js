const mongoose = require("mongoose");

const tagsSchema = new mongoose.Schema(
  {
    name: { type: String, default: null },
    uniqueId: { type: String },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

tagsSchema.index({ uniqueId: 1 });

module.exports = mongoose.model("Tags", tagsSchema);