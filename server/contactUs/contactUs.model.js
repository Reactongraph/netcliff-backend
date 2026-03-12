const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    name: { type: String },
    link: { type: String },
    image: { type: String },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Contact", contactSchema);
