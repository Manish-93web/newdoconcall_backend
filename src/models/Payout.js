const mongoose = require("mongoose");

const payoutSchema = new mongoose.Schema(
  {
    payee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    payeeType: { type: String, enum: ["doctor", "clinic", "lab"], required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    grossAmount: { type: Number, required: true },
    commissionDeducted: { type: Number, required: true },
    netAmount: { type: Number, required: true },
    status: { type: String, enum: ["pending", "processing", "paid", "failed"], default: "pending" },
    transactions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Payment" }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payout", payoutSchema);
