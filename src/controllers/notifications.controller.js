const Notification = require("../models/Notification");
const { ok, ApiError } = require("../utils/apiResponse");
const { parsePagination, buildMeta } = require("../utils/pagination");
const asyncHandler = require("../utils/asyncHandler");

const list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const { skip } = parsePagination({ page, limit });

  const query = { recipient: req.user.id };
  const [notifications, total] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Notification.countDocuments(query),
  ]);

  return ok(res, notifications, "OK", buildMeta({ page: Number(page), limit: Number(limit), total }));
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({ _id: req.params.id, recipient: req.user.id });
  if (!notification) throw new ApiError(404, "NOT_FOUND", "Notification not found");

  notification.status = "read";
  notification.readAt = new Date();
  await notification.save();

  return ok(res, notification, "Marked as read");
});

module.exports = { list, markRead };
