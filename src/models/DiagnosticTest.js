const mongoose = require("mongoose");

const diagnosticTestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    category: String,
    sampleType: String,
    preparationInstructions: String,
    basePrice: { type: Number, required: true },
    reportTurnaroundHours: { type: Number, default: 24 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DiagnosticTest", diagnosticTestSchema);
