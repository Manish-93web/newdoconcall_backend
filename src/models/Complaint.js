const mongoose = require("mongoose");

const complaintSchema = new mongoose.Schema(
  {
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    against: {
      targetType: { type: String, enum: ["doctor", "clinic", "lab", "user", "order"] },
      targetId: mongoose.Schema.Types.ObjectId,
    },
    category: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, enum: ["open", "investigating", "resolved", "dismissed"], default: "open" },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resolutionNote: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Complaint", complaintSchema);
