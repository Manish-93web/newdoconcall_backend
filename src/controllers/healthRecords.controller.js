const HealthRecord = require("../models/HealthRecord");
const { ok, created, ApiError } = require("../utils/apiResponse");
const { parsePagination, buildMeta } = require("../utils/pagination");
const asyncHandler = require("../utils/asyncHandler");

const list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, type, forFamilyMemberId } = req.query;
  const { skip } = parsePagination({ page, limit });

  const query = { owner: req.user.id };
  if (type) query.type = type;
  if (forFamilyMemberId) query.forFamilyMember = forFamilyMemberId;

  const [records, total] = await Promise.all([
    HealthRecord.find(query).sort({ recordDate: -1 }).skip(skip).limit(Number(limit)),
    HealthRecord.countDocuments(query),
  ]);

  return ok(res, records, "OK", buildMeta({ page: Number(page), limit: Number(limit), total }));
});

const create = asyncHandler(async (req, res) => {
  const record = await HealthRecord.create({ ...req.body, owner: req.user.id });
  return created(res, record);
});

async function findOwned(id, ownerId) {
  const record = await HealthRecord.findOne({ _id: id, owner: ownerId });
  if (!record) throw new ApiError(404, "NOT_FOUND", "Health record not found");
  return record;
}

const getOne = asyncHandler(async (req, res) => {
  const record = await HealthRecord.findById(req.params.id);
  if (!record) throw new ApiError(404, "NOT_FOUND", "Health record not found");

  const isOwner = record.owner.toString() === req.user.id;
  const hasGrant = record.accessGrants.some((g) => g.grantedTo.toString() === req.user.id);
  if (!isOwner && !hasGrant) throw new ApiError(403, "FORBIDDEN", "You cannot view this record");

  return ok(res, record);
});

const remove = asyncHandler(async (req, res) => {
  await findOwned(req.params.id, req.user.id);
  await HealthRecord.findByIdAndDelete(req.params.id);
  return ok(res, null, "Deleted");
});

const share = asyncHandler(async (req, res) => {
  const { grantedTo, expiresAt } = req.body;
  const record = await findOwned(req.params.id, req.user.id);

  record.accessGrants.push({ grantedTo, expiresAt: expiresAt || null });
  record.visibility = "shared_with_doctor";
  await record.save();

  return ok(res, record, "Access granted");
});

module.exports = { list, create, getOne, remove, share };
