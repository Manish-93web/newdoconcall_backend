const mongoose = require("mongoose");
const { NOTIFICATION_CHANNELS } = require("../config/constants");

// body/title support {{variableName}} placeholders, interpolated in notification.service.js's
// notify(). This is a new convention introduced with this model — notify() previously did
// zero interpolation, every call site built its final string with JS template literals.
const notificationTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    channels: [{ type: String, enum: Object.values(NOTIFICATION_CHANNELS) }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("NotificationTemplate", notificationTemplateSchema);
