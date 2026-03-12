const mongoose = require("mongoose");

const ticketByUserSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    contactNumber: { type: String, default: "" },
    description: { type: String, default: "" },
    image: { type: String, default: "" },
    status: { type: String, enum: ["Pending", "Solved"] },
    comment: {
      type: String,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("TicketByUser", ticketByUserSchema);
