const mongoose = require("mongoose");

const diagnosticBookingSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    forFamilyMember: { type: mongoose.Schema.Types.ObjectId, ref: "FamilyMember", default: null },
    lab: { type: mongoose.Schema.Types.ObjectId, ref: "Lab", required: true },
    tests: [
      {
        test: { type: mongoose.Schema.Types.ObjectId, ref: "DiagnosticTest", required: true },
        price: { type: Number, required: true },
      },
    ],
    collectionType: { type: String, enum: ["home", "lab_visit"], required: true },
    scheduledSlot: { type: Date, required: true },
    address: {
      line1: String,
      city: String,
      state: String,
      pincode: String,
    },
    totalAmount: { type: Number, required: true },
    commissionAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["booked", "sample_collected", "processing", "report_ready", "cancelled"],
      default: "booked",
      index: true,
    },
    reportFile: { type: mongoose.Schema.Types.ObjectId, ref: "UploadedFile" },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DiagnosticBooking", diagnosticBookingSchema);
