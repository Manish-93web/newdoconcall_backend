const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    targetType: { type: String, enum: ["doctor", "clinic", "lab"], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "targetTypeModel" },
    targetTypeModel: { type: String, required: true }, // "DoctorProfile" | "ClinicProfile" | "Lab"
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment" },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: String,
    status: { type: String, enum: ["visible", "flagged", "removed"], default: "visible" },
  },
  { timestamps: true }
);

reviewSchema.index({ targetType: 1, targetId: 1 });

module.exports = mongoose.model("Review", reviewSchema);
