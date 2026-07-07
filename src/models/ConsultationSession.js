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
        role: { type: String, enum: ["patient", "doctor"] },
        joinedAt: Date,
        leftAt: Date,
        socketId: String,
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
