const mongoose = require("mongoose");

// Panel-style tests (CBC, Lipid Profile, ...) report several individually-measured
// parameters, each against its own normal range — e.g. Hemoglobin: 13-17 g/dL. Narrative
// tests (histopathology, radiology impressions) have no numeric range; leave subTests
// empty for those rather than inventing one, or use it for descriptive components only.
const subTestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    unit: { type: String, default: "" },
    referenceRange: { type: String, default: "" },
  },
  { _id: false }
);

const diagnosticTestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    category: String,
    sampleType: String,
    preparationInstructions: String,
    basePrice: { type: Number, required: true },
    reportTurnaroundHours: { type: Number, default: 24 },
    subTests: { type: [subTestSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DiagnosticTest", diagnosticTestSchema);
