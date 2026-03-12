const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    password: String,
    image: String,
    purchaseCode: { type: String, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Admin", adminSchema);
