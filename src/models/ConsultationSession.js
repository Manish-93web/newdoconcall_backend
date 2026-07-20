const mongoose = require("mongoose");
const { CONSULTATION_STATES } = require("../config/constants");

const consultationSessionSchema = new mongoose.Schema(
  {
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", required: true, index: true },
    sessionRoomId: { type: String, required: true, unique: true },
    mode: { type: String, enum: ["video", "voice", "chat"], required: true },
    state: {
      type: String,
      enum: Object.values(CONSULTATION_STATES),
      default: CONSULTATION_STATES.SCHEDULED,
      index: true,
    },
    participants: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        // "specialist" = a doctor invited mid-call for a second opinion, not part of the
        // original appointment — see consultations.controller.js's invite()/acceptInvite().
        role: { type: String, enum: ["patient", "doctor", "specialist"] },
        joinedAt: Date,
        leftAt: Date,
        socketId: String,
      },
    ],
    // Doctors invited but who haven't accepted yet. Moved into `participants` (role:
    // "specialist") on accept, or removed outright on decline — see consultations.controller.js.
    pendingInvites: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        invitedAt: { type: Date, default: Date.now },
      },
    ],
    startedAt: Date,
    endedAt: Date,
    durationSeconds: Number,
    chatTranscript: [
      {
        sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        message: String,
        sentAt: { type: Date, default: Date.now },
      },
    ],
    sharedFiles: [
      {
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        fileRef: { type: mongoose.Schema.Types.ObjectId, ref: "UploadedFile" },
      },
    ],
    endReason: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("ConsultationSession", consultationSessionSchema);
