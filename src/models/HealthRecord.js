const mongoose = require("mongoose");

const healthRecordSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    forFamilyMember: { type: mongoose.Schema.Types.ObjectId, ref: "FamilyMember", default: null },
    type: {
      type: String,
      enum: ["prescription", "lab_report", "vaccination", "doctor_note", "other"],
      required: true,
    },
    title: { type: String, required: true },
    sourcePrescription: { type: mongoose.Schema.Types.ObjectId, ref: "Prescription" },
    sourceDiagnosticBooking: { type: mongoose.Schema.Types.ObjectId, ref: "DiagnosticBooking" },
    fileRef: { type: mongoose.Schema.Types.ObjectId, ref: "UploadedFile" },
    notes: String,
    recordDate: { type: Date, default: Date.now },
    accessGrants: [
      {
        grantedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        grantedAt: { type: Date, default: Date.now },
        expiresAt: Date,
      },
    ],
    visibility: { type: String, enum: ["private", "shared_with_doctor"], default: "private" },
  },
  { timestamps: true }
);

healthRecordSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model("HealthRecord", healthRecordSchema);
