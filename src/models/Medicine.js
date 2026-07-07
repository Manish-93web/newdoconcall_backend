const mongoose = require("mongoose");

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, index: true },
    genericName: String,
    manufacturer: String,
    composition: String,
    form: { type: String, enum: ["tablet", "capsule", "syrup", "injection", "cream", "drops", "other"] },
    packSize: String,
    price: {
      mrp: { type: Number, required: true },
      sellingPrice: { type: Number, required: true },
    },
    prescriptionRequired: { type: Boolean, default: true },
    alternatives: [{ type: mongoose.Schema.Types.ObjectId, ref: "Medicine" }],
    stock: { type: Number, default: 100 },
    category: String,
  },
  { timestamps: true }
);

medicineSchema.index({ name: "text", genericName: "text", composition: "text" });

module.exports = mongoose.model("Medicine", medicineSchema);
