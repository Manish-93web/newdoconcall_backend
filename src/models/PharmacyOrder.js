const mongoose = require("mongoose");

const pharmacyOrderSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    forFamilyMember: { type: mongoose.Schema.Types.ObjectId, ref: "FamilyMember", default: null },
    prescriptionUpload: { type: mongoose.Schema.Types.ObjectId, ref: "UploadedFile", default: null },
    linkedPrescription: { type: mongoose.Schema.Types.ObjectId, ref: "Prescription", default: null },
    items: [
      {
        medicine: { type: mongoose.Schema.Types.ObjectId, ref: "Medicine", required: true },
        quantity: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true },
      },
    ],
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    commissionAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    deliveryAddress: {
      line1: String,
      city: String,
      state: String,
      pincode: String,
    },
    status: {
      type: String,
      enum: [
        "placed",
        "prescription_review",
        "confirmed",
        "packed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "refunded",
      ],
      default: "placed",
      index: true,
    },
    trackingUpdates: [
      {
        status: String,
        note: String,
        at: { type: Date, default: Date.now },
      },
    ],
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
    refillReminder: {
      enabled: { type: Boolean, default: false },
      intervalDays: Number,
      nextReminderAt: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PharmacyOrder", pharmacyOrderSchema);
