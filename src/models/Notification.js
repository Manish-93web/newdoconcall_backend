const mongoose = require("mongoose");
const { NOTIFICATION_CHANNELS } = require("../config/constants");

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    channel: { type: String, enum: Object.values(NOTIFICATION_CHANNELS), required: true },
    type: { type: String, required: true }, // e.g. appointment_reminder, otp, order_status
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: mongoose.Schema.Types.Mixed,
    status: {
      type: String,
      enum: ["queued", "sent", "failed", "read"],
      default: "queued",
    },
    // Separate from `status` (delivery outcome — did the push/SMS/etc actually send) so
    // marking read/unread in the UI never overwrites delivery tracking.
    isRead: { type: Boolean, default: false, index: true },
    readAt: Date,
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
