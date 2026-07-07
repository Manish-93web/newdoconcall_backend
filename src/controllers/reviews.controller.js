const mongoose = require("mongoose");
const Review = require("../models/Review");
const Appointment = require("../models/Appointment");
const DoctorProfile = require("../models/DoctorProfile");
const { ok, created, ApiError } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const TARGET_MODEL = { doctor: "DoctorProfile", clinic: "ClinicProfile", lab: "Lab" };

async function recalcRating(targetType, targetId) {
  const Model = require(`../models/${TARGET_MODEL[targetType]}`);
  // aggregate() skips Mongoose's automatic schema-based casting that find() does, so
  // targetId (a plain string from req.body) must be cast to ObjectId by hand or it
  // silently matches nothing against the stored ObjectId field.
  const stats = await Review.aggregate([
    { $match: { targetType, targetId: new mongoose.Types.ObjectId(targetId), status: "visible" } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const { avg = 0, count = 0 } = stats[0] || {};
  await Model.findByIdAndUpdate(targetId, { ratingAvg: Math.round(avg * 10) / 10, ratingCount: count });
}

const create = asyncHandler(async (req, res) => {
  const { targetType, targetId, appointmentId, rating, comment } = req.body;

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment || appointment.patient.toString() !== req.user.id) {
    throw new ApiError(403, "FORBIDDEN", "You may only review appointments you completed");
  }
  if (appointment.status !== "completed") {
    throw new ApiError(400, "APPOINTMENT_NOT_COMPLETED", "You can only review a completed appointment");
  }
  if (targetType === "doctor") {
    const doctor = await DoctorProfile.findById(targetId);
    if (!doctor || doctor._id.toString() !== appointment.doctor.toString()) {
      throw new ApiError(400, "TARGET_MISMATCH", "Target does not match the appointment's doctor");
    }
  }

  const review = await Review.create({
    reviewer: req.user.id,
    targetType,
    targetId,
    targetTypeModel: TARGET_MODEL[targetType],
    appointment: appointmentId,
    rating,
    comment,
  });

  await recalcRating(targetType, targetId);
  return created(res, review, "Review submitted");
});

const listForTarget = asyncHandler(async (req, res) => {
  const { targetType, targetId } = req.query;
  if (!targetType || !targetId) throw new ApiError(400, "MISSING_PARAMS", "targetType and targetId are required");

  const reviews = await Review.find({ targetType, targetId, status: "visible" })
    .populate({ path: "reviewer", select: "name" })
    .sort({ createdAt: -1 });
  return ok(res, reviews);
});

module.exports = { create, listForTarget };
