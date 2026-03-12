const mongoose = require("mongoose");

const languageSchema = new mongoose.Schema(
    {
        name: { type: String, default: null },
        uniqueId: { type: String, required: true },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

languageSchema.index({ uniqueId: 1 });

module.exports = mongoose.model("Language", languageSchema);
