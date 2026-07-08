const Affiliate = require("../models/Affiliate");
const DoctorProfile = require("../models/DoctorProfile");
const Payout = require("../models/Payout");
const { ok, created, ApiError } = require("../utils/apiResponse");
const { parsePagination, buildMeta } = require("../utils/pagination");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditLog } = require("../utils/auditLog");

const POPULATE = [
  { path: "referredDoctors", populate: { path: "user", select: "name" } },
  { path: "referredClinics", select: "name" },
];

const list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const { skip } = parsePagination({ page, limit });

  const [affiliates, total] = await Promise.all([
    Affiliate.find().populate(POPULATE).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Affiliate.countDocuments(),
  ]);

  return ok(res, affiliates, "OK", buildMeta({ page: Number(page), limit: Number(limit), total }));
});

const create = asyncHandler(async (req, res) => {
  const affiliate = await Affiliate.create(req.body);
  await recordAuditLog(req.user, "create_affiliate", "Affiliate", affiliate._id, null, req.body, req);
  return created(res, affiliate, "Affiliate created");
});

const update = asyncHandler(async (req, res) => {
  const affiliate = await Affiliate.findById(req.params.id);
  if (!affiliate) throw new ApiError(404, "NOT_FOUND", "Affiliate not found");
  const before = affiliate.toObject();
  Object.assign(affiliate, req.body);
  await affiliate.save();
  await recordAuditLog(req.user, "update_affiliate", "Affiliate", affiliate._id, before, req.body, req);
  return ok(res, affiliate, "Affiliate updated");
});

const link = asyncHandler(async (req, res) => {
  const affiliate = await Affiliate.findById(req.params.id);
  if (!affiliate) throw new ApiError(404, "NOT_FOUND", "Affiliate not found");
  const { doctorId, clinicId } = req.body;
  const update = {};
  if (doctorId) update.$addToSet = { ...update.$addToSet, referredDoctors: doctorId };
  if (clinicId) update.$addToSet = { ...update.$addToSet, referredClinics: clinicId };
  await Affiliate.updateOne({ _id: affiliate._id }, update);
  await recordAuditLog(req.user, "link_affiliate", "Affiliate", affiliate._id, null, { doctorId, clinicId }, req);
  const updated = await Affiliate.findById(affiliate._id).populate(POPULATE);
  return ok(res, updated, "Affiliate updated");
});

// Derived, read-only report — no ledger document is created, and this is not integrated
// into Payout.generate(). If affiliates ever need to actually be paid, that's separate work.
// referredClinics contributes 0 here since Payout.generate() only ever creates doctor
// payouts today (payeeType "clinic" is a schema value with no producing code path).
const commissions = asyncHandler(async (req, res) => {
  const affiliate = await Affiliate.findById(req.params.id);
  if (!affiliate) throw new ApiError(404, "NOT_FOUND", "Affiliate not found");

  const { from, to } = req.query;
  const doctorProfiles = await DoctorProfile.find({ _id: { $in: affiliate.referredDoctors } }).select("user");
  const payeeUserIds = doctorProfiles.map((d) => d.user);

  const match = { payee: { $in: payeeUserIds } };
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) match.createdAt.$lte = new Date(to);
  }

  const payouts = payeeUserIds.length ? await Payout.find(match) : [];
  const totalNet = payouts.reduce((sum, p) => sum + p.netAmount, 0);
  const commissionOwed = totalNet * (affiliate.commissionPercent / 100);

  return ok(res, {
    affiliateId: affiliate._id,
    payoutCount: payouts.length,
    totalNet,
    commissionPercent: affiliate.commissionPercent,
    commissionOwed,
  });
});

module.exports = { list, create, update, link, commissions };
