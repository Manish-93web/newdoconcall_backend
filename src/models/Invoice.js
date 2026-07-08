const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    clinic: { type: mongoose.Schema.Types.ObjectId, ref: "ClinicProfile", required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", default: null },
    invoiceNumber: { type: String, required: true, unique: true },
    items: [
      {
        description: { type: String, required: true },
        quantity: { type: Number, default: 1 },
        unitAmount: { type: Number, required: true },
      },
    ],
    taxPercent: { type: Number, default: 0 },
    subtotal: { type: Number, required: true },
    taxAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    status: { type: String, enum: ["unpaid", "paid", "void"], default: "unpaid", index: true },
    notes: String,
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    paidAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Invoice", invoiceSchema);
