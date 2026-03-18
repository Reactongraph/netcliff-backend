const mongoose = require("mongoose");

const ExportHistorySchema = new mongoose.Schema(
  {
    analyticsTypes: [
      {
        type: String,
        enum: ["Overview", "Content", "Subscriptions", "Payments", "Registrations"],
      },
    ],
    // For table exports (from Platform Analytics)
    tableType: { type: String, enum: ["overview", "content", "subscriptions", "payments", "registrations"] },
    format: { type: String, enum: ["csv", "pdf"] },
    dateRange: { type: String }, // e.g. "Mar 2026" or "All Time"
    email: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Completed", "Failed"],
      default: "Pending",
    },
    reportStatus: {
      type: String,
      enum: ["Pending", "Generated", "Failed"],
      default: "Pending",
    },
    emailStatus: {
      type: String,
      enum: ["Pending", "Sent", "Failed"],
      default: "Pending",
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    downloadUrl: {
      type: String,
    },
    error: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ExportHistory", ExportHistorySchema);
