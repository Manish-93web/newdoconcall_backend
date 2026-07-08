const Complaint = require("../models/Complaint");
const { ok, created, ApiError } = require("../utils/apiResponse");
const { parsePagination, buildMeta } = require("../utils/pagination");
const { sanitizeText } = require("../utils/sanitize");
const asyncHandler = require("../utils/asyncHandler");
const { ROLES } = require("../config/constants");

const create = asyncHandler(async (req, res) => {
  const complaint = await Complaint.create({
    ...req.body,
    description: sanitizeText(req.body.description),
    raisedBy: req.user.id,
  });
  return created(res, complaint, "Complaint submitted");
});

const list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const { skip } = parsePagination({ page, limit });

  const query = req.user.role === ROLES.PLATFORM_ADMIN ? {} : { raisedBy: req.user.id };
  if (status) query.status = status;

  const [complaints, total] = await Promise.all([
    Complaint.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Complaint.countDocuments(query),
  ]);

  return ok(res, complaints, "OK", buildMeta({ page: Number(page), limit: Number(limit), total }));
});

const resolve = asyncHandler(async (req, res) => {
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) throw new ApiError(404, "NOT_FOUND", "Complaint not found");

  complaint.status = req.body.status;
  complaint.resolutionNote = sanitizeText(req.body.resolutionNote);
  complaint.handledBy = req.user.id;
  await complaint.save();

  return ok(res, complaint, "Complaint updated");
});

module.exports = { create, list, resolve };
