const Notification = require("../models/Notification");
const Appointment = require("../models/Appointment");
const { ok, ApiError } = require("../utils/apiResponse");
const { parsePagination, buildMeta } = require("../utils/pagination");
const asyncHandler = require("../utils/asyncHandler");

const list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const { skip } = parsePagination({ page, limit });

  const query = { recipient: req.user.id };
  const [notifications, total] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Notification.countDocuments(query),
  ]);

  // Attach the *current* appointment status to any notification referencing one, so a
  // client can tell a stale "join the call" prompt (appointment long since completed/
  // cancelled) apart from a genuinely still-open one — the notification's own text/data
  // is frozen at send time and never reflects what happened to the appointment since.
  const appointmentIds = [...new Set(notifications.map((n) => n.data?.appointmentId).filter(Boolean))];
  if (appointmentIds.length) {
    const appointments = await Appointment.find({ _id: { $in: appointmentIds } }).select("status");
    const statusById = new Map(appointments.map((a) => [a._id.toString(), a.status]));
    for (const n of notifications) {
      if (n.data?.appointmentId) n.data.appointmentStatus = statusById.get(n.data.appointmentId.toString()) || null;
    }
  }

  return ok(res, notifications, "OK", buildMeta({ page: Number(page), limit: Number(limit), total }));
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({ _id: req.params.id, recipient: req.user.id });
  if (!notification) throw new ApiError(404, "NOT_FOUND", "Notification not found");

  notification.isRead = true;
  notification.readAt = new Date();
  await notification.save();

  return ok(res, notification, "Marked as read");
});

const markUnread = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({ _id: req.params.id, recipient: req.user.id });
  if (!notification) throw new ApiError(404, "NOT_FOUND", "Notification not found");

  notification.isRead = false;
  notification.readAt = null;
  await notification.save();

  return ok(res, notification, "Marked as unread");
});

const unreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({ recipient: req.user.id, isRead: false });
  return ok(res, { count });
});

module.exports = { list, markRead, markUnread, unreadCount };
