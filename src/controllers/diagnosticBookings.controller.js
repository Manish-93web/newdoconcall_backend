const DiagnosticBooking = require("../models/DiagnosticBooking");
const Lab = require("../models/Lab");
const storage = require("../services/storage/storage.service");
const { computeSplit } = require("../services/commission/commission.service");
const { ok, created, ApiError } = require("../utils/apiResponse");
const { parsePagination, buildMeta } = require("../utils/pagination");
const asyncHandler = require("../utils/asyncHandler");
const { ROLES } = require("../config/constants");

const create = asyncHandler(async (req, res) => {
  const { labId, forFamilyMemberId, testIds, collectionType, scheduledSlot, address } = req.body;

  const lab = await Lab.findById(labId);
  if (!lab) throw new ApiError(404, "NOT_FOUND", "Lab not found");

  const selectedOfferings = lab.testsOffered.filter((o) => testIds.includes(o.test.toString()));
  if (selectedOfferings.length !== testIds.length) {
    throw new ApiError(400, "TEST_NOT_OFFERED", "One or more tests are not offered by this lab");
  }
  if (collectionType === "home" && selectedOfferings.some((o) => !o.homeCollectionAvailable)) {
    throw new ApiError(400, "HOME_COLLECTION_UNAVAILABLE", "Home collection is not available for one or more tests");
  }

  const testsAmount = selectedOfferings.reduce((sum, o) => sum + o.price, 0);
  const homeCollectionFee =
    collectionType === "home" ? Math.max(...selectedOfferings.map((o) => o.homeCollectionFee || 0)) : 0;
  const totalAmount = testsAmount + homeCollectionFee;
  const { commissionAmount } = await computeSplit("diagnostic_booking", testsAmount);

  const booking = await DiagnosticBooking.create({
    patient: req.user.id,
    forFamilyMember: forFamilyMemberId || null,
    lab: lab._id,
    tests: selectedOfferings.map((o) => ({ test: o.test, price: o.price })),
    collectionType,
    scheduledSlot,
    address,
    totalAmount,
    commissionAmount,
    status: "booked",
  });

  return created(res, booking, "Diagnostic test booked");
});

const list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const { skip } = parsePagination({ page, limit });

  const query = req.user.role === ROLES.PLATFORM_ADMIN ? {} : { patient: req.user.id };
  const [bookings, total] = await Promise.all([
    DiagnosticBooking.find(query)
      .populate("lab", "name address")
      .populate("tests.test", "name")
      .sort({ scheduledSlot: -1 })
      .skip(skip)
      .limit(Number(limit)),
    DiagnosticBooking.countDocuments(query),
  ]);

  return ok(res, bookings, "OK", buildMeta({ page: Number(page), limit: Number(limit), total }));
});

const getOne = asyncHandler(async (req, res) => {
  const booking = await DiagnosticBooking.findById(req.params.id)
    .populate("lab")
    .populate("tests.test");
  if (!booking) throw new ApiError(404, "NOT_FOUND", "Booking not found");
  if (booking.patient.toString() !== req.user.id && req.user.role !== ROLES.PLATFORM_ADMIN) {
    throw new ApiError(403, "FORBIDDEN", "You cannot view this booking");
  }
  return ok(res, booking);
});

const updateStatus = asyncHandler(async (req, res) => {
  const booking = await DiagnosticBooking.findById(req.params.id);
  if (!booking) throw new ApiError(404, "NOT_FOUND", "Booking not found");

  booking.status = req.body.status;
  await booking.save();
  return ok(res, booking, "Booking status updated");
});

const getReport = asyncHandler(async (req, res) => {
  const booking = await DiagnosticBooking.findById(req.params.id).populate("reportFile");
  if (!booking) throw new ApiError(404, "NOT_FOUND", "Booking not found");
  if (booking.patient.toString() !== req.user.id && req.user.role !== ROLES.PLATFORM_ADMIN) {
    throw new ApiError(403, "FORBIDDEN", "You cannot view this report");
  }
  if (!booking.reportFile) throw new ApiError(404, "REPORT_NOT_READY", "Report is not available yet");

  const readStream = await storage.getStream(booking.reportFile.path);
  res.setHeader("Content-Type", booking.reportFile.mimetype || "application/octet-stream");
  readStream.pipe(res);
});

module.exports = { create, list, getOne, updateStatus, getReport };
