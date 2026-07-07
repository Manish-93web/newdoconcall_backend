const mongoose = require("mongoose");

const prescriptionSchema = new mongoose.Schema(
  {
    consultationSession: { type: mongoose.Schema.Types.ObjectId, ref: "ConsultationSession", default: null },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "DoctorProfile", required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    forFamilyMember: { type: mongoose.Schema.Types.ObjectId, ref: "FamilyMember", default: null },
    medicines: [
      {
        name: { type: String, required: true },
        dosage: String,
        frequency: String,
        durationDays: Number,
      },
    ],
    diagnosis: [String],
    advice: String,
    followUpInstructions: String,
    pdfFile: { type: mongoose.Schema.Types.ObjectId, ref: "UploadedFile" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Prescription", prescriptionSchema);
