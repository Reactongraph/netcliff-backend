const mongoose = require("mongoose");

const FAQSchema = new mongoose.Schema(
  {
    question: { type: String },
    answer: { type: String },
    isView: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("FAQ", FAQSchema);
