const mongoose = require("mongoose");
const { APPOINTMENT_MODES, APPOINTMENT_STATUSES } = require("../config/constants");

const appointmentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    forFamilyMember: { type: mongoose.Schema.Types.ObjectId, ref: "FamilyMember", default: null },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "DoctorProfile", required: true, index: true },
    clinic: { type: mongoose.Schema.Types.ObjectId, ref: "ClinicProfile", default: null },
    mode: { type: String, enum: Object.values(APPOINTMENT_MODES), required: true },
    scheduledStart: { type: Date, required: true },
    scheduledEnd: { type: Date, required: true },
    status: {
      type: String,
      enum: Object.values(APPOINTMENT_STATUSES),
      default: APPOINTMENT_STATUSES.PENDING_PAYMENT,
      index: true,
    },
    bookingType: { type: String, enum: ["scheduled", "instant"], default: "scheduled" },
    fee: {
      amount: { type: Number, required: true },
      commissionAmount: { type: Number, default: 0 },
      doctorPayoutAmount: { type: Number, default: 0 },
    },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
    cancellation: {
      cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reason: String,
      cancelledAt: Date,
    },
    followUpWindowEndsAt: Date,
    parentAppointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", default: null },
    // Set when an instant consult is funded by a session credit instead of a Stripe
    // charge — complete() decrements this subscription's sessionsRemaining.
    sessionSource: { type: mongoose.Schema.Types.ObjectId, ref: "PatientSubscription", default: null },
  },
  { timestamps: true }
);

appointmentSchema.index({ doctor: 1, scheduledStart: 1 });
appointmentSchema.index({ patient: 1, scheduledStart: 1 });

module.exports = mongoose.model("Appointment", appointmentSchema);
