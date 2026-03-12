const mongoose = require("mongoose");

const ContinentRegionSchema = new mongoose.Schema(
  {
    name: { type: String },
    uniqueID: { type: String, default: null },
    order: { type: Number }
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

ContinentRegionSchema.pre('save', async function (next) {
  try {
    if (this.isNew) {
      // Get the count of existing documents
      const count = await mongoose.model("ContinentRegion").countDocuments();

      // Generate uniqueID (CR0001, CR0002, etc.)
      this.uniqueID = `CR${(count + 1).toString().padStart(2, '0')}`;
      // this.order = count + 1;
    }
    next();
  } catch (error) {
    next(error);
  }
});

ContinentRegionSchema.index({ uniqueID: 1 });

module.exports = mongoose.model("ContinentRegion", ContinentRegionSchema);
