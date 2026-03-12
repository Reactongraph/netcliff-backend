const mongoose = require("mongoose");

const badgeSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        placement: {
            type: String,
            enum: ["top-left", "top-right", "bottom-left", "bottom-right"],
            default: "top-left",
        },
        style: {
            type: String,
            enum: ["square", "rounded"],
            default: "square",
        },
        category: {
            type: String,
            enum: ["trending", "editors-choice", "views-based", "published-based", "custom"],
            default: "custom",
        },
        bgColor:{ type: String, default: "" },
        textColor:{ type: String, default: "" },
        status: { type: Boolean, default: true },
        priority: { type: Number, default: 0 },
        metrics: [
            {
                type: { type: String, enum: ["views", "watchTime", "clicks", "publishedAt"], required: true },
                minValue: { type: Number, default: 1 },
                days: { type: Number, default: 7 },
                weightage: { type: Number, default: 1, min: 1, max: 5 },
            },
        ],
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

badgeSchema.index({ name: 1 });
badgeSchema.index({ "metrics.type": 1 });

module.exports = mongoose.model("Badge", badgeSchema);
