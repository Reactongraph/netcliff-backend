const mongoose = require("mongoose");

const CitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    uniqueID: {
      type: String,
      default: null
    },
    region: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Region',
      required: true
    }
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

CitySchema.pre('save', async function (next) {
  try {
    if (this.isNew) {
      const count = await mongoose.model("City").countDocuments();

      this.uniqueID = `CT${(count + 1).toString().padStart(4, '0')}`;
    }
    next();
  } catch (error) {
    next(error);
  }
});

CitySchema.pre("insertMany", async function (next, docs) {
  try {
    const count = await mongoose.model("City").countDocuments();

    docs.forEach((doc, index) => {
      doc.uniqueID = `CT${(count + index + 1).toString().padStart(4, "0")}`;
    });

    next();
  } catch (error) {
    next(error);
  }
});
CitySchema.index({ region: 1 });
CitySchema.index({ name: 1 });
CitySchema.index({ name: 'text' });


module.exports = mongoose.model("City", CitySchema);
