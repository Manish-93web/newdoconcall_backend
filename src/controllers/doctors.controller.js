const DoctorProfile = require("../models/DoctorProfile");
const Appointment = require("../models/Appointment");
const { geocodeAddress } = require("../services/maps/googleMaps.service");
const { getEstimatedWaitMinutes } = require("../services/consultation/doctorAvailability.service");
const { ok, created, ApiError } = require("../utils/apiResponse");
const { parsePagination, buildMeta } = require("../utils/pagination");
const { sanitizeText } = require("../utils/sanitize");
const asyncHandler = require("../utils/asyncHandler");

const PUBLIC_POPULATE = [
  { path: "specializations", select: "name" },
  { path: "clinics", select: "name address type" },
];

const search = asyncHandler(async (req, res) => {
  const {
    lat,
    lng,
    radiusKm,
    specialization,
    minFee,
    maxFee,
    minRating,
    minExperience,
    maxExperience,
    clinicId,
    availableNow,
    name,
    page,
    limit,
  } = req.query;
  const { skip } = parsePagination({ page, limit });

  const query = { "verification.status": "verified", isListed: true };
  if (specialization) query.specializations = specialization;
  if (minRating) query.ratingAvg = { $gte: Number(minRating) };
  if (clinicId) query.clinics = clinicId;
  if (availableNow === "true") query["liveStatus.state"] = "available";
  if (minFee || maxFee) {
    query["consultationFee.inClinic"] = {};
    if (minFee) query["consultationFee.inClinic"].$gte = Number(minFee);
    if (maxFee) query["consultationFee.inClinic"].$lte = Number(maxFee);
  }
  if (minExperience || maxExperience) {
    query.experienceYears = {};
    if (minExperience) query.experienceYears.$gte = Number(minExperience);
    if (maxExperience) query.experienceYears.$lte = Number(maxExperience);
  }
  if (lat && lng) {
    // $near forces an implicit distance sort and is rejected by countDocuments'
    // aggregation internally, so we use $centerSphere instead — it's a plain boolean
    // filter (radius match, no forced sort) that works identically in find() and count().
    const EARTH_RADIUS_KM = 6378.1;
    query["address.geo"] = {
      $geoWithin: {
        $centerSphere: [[Number(lng), Number(lat)], Number(radiusKm) / EARTH_RADIUS_KM],
      },
    };
  }

  if (name) {
    const User = require("../models/User");
    const matches = await User.find({ name: new RegExp(name, "i"), role: "doctor" }).select("_id");
    query.user = { $in: matches.map((u) => u._id) };
  }

  const [doctors, total] = await Promise.all([
    DoctorProfile.find(query)
      .populate(PUBLIC_POPULATE)
      .populate({ path: "user", select: "name profileImage" })
      .sort({ ratingAvg: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    DoctorProfile.countDocuments(query),
  ]);

  // Estimated wait, for the "available now" doctors who happen to be mid-call right now —
  // a clearly-labeled estimate (see doctorAvailability.service.js), not a hard promise.
  // Available-and-idle doctors are simply absent from this map, i.e. a 0-minute wait.
  const availableIds = doctors.filter((d) => d.liveStatus?.state === "available").map((d) => d._id);
  const waitByDoctor = await getEstimatedWaitMinutes(availableIds);
  for (const doctor of doctors) {
    if (doctor.liveStatus?.state === "available") {
      doctor.estimatedWaitMinutes = waitByDoctor.get(doctor._id.toString()) ?? 0;
    }
  }

  return ok(res, doctors, "OK", buildMeta({ page: Number(page), limit: Number(limit), total }));
});

const getOne = asyncHandler(async (req, res) => {
  const doctor = await DoctorProfile.findById(req.params.id)
    .populate(PUBLIC_POPULATE)
    .populate({ path: "user", select: "name profileImage email phone" });
  if (!doctor) throw new ApiError(404, "NOT_FOUND", "Doctor not found");
  return ok(res, doctor);
});

const getMyProfile = asyncHandler(async (req, res) => {
  const doctor = await DoctorProfile.findOne({ user: req.user.id }).populate(PUBLIC_POPULATE);
  if (!doctor) throw new ApiError(404, "NOT_FOUND", "Doctor profile not found — create one first");
  return ok(res, doctor);
});

const setLiveStatus = asyncHandler(async (req, res) => {
  const { state } = req.body;
  if (!["available", "offline"].includes(state)) {
    throw new ApiError(400, "INVALID_STATE", "state must be 'available' or 'offline'");
  }
  const doctor = await DoctorProfile.findOneAndUpdate(
    { user: req.user.id },
    { liveStatus: { state, updatedAt: new Date() } },
    { new: true }
  );
  if (!doctor) throw new ApiError(404, "NOT_FOUND", "Doctor profile not found — create one first");
  return ok(res, doctor, "Live status updated");
});

async function geocodeIfNeeded(payload) {
  if (payload.address?.line1 || payload.address?.city) {
    const geo = await geocodeAddress(payload.address);
    if (geo) payload.address.geo = geo;
  }
  return payload;
}

const upsertMyProfile = asyncHandler(async (req, res) => {
  const payload = await geocodeIfNeeded({ ...req.body });
  if (payload.bio) payload.bio = sanitizeText(payload.bio);
  const existing = await DoctorProfile.findOne({ user: req.user.id });

  if (existing) {
    Object.assign(existing, payload);
    await existing.save();
    return ok(res, existing, "Doctor profile updated");
  }

  const doctor = await DoctorProfile.create({ ...payload, user: req.user.id });
  return created(res, doctor, "Doctor profile created");
});

const getAvailability = asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) throw new ApiError(400, "DATE_REQUIRED", "Query param 'date' (YYYY-MM-DD) is required");

  const doctor = await DoctorProfile.findById(req.params.id);
  if (!doctor) throw new ApiError(404, "NOT_FOUND", "Doctor not found");

  const targetDate = new Date(date);
  const dayOfWeek = targetDate.getDay();
  const rules = doctor.availability.filter((a) => a.dayOfWeek === dayOfWeek);

  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${date}T23:59:59`);
  const existingAppointments = await Appointment.find({
    doctor: doctor._id,
    scheduledStart: { $gte: dayStart, $lte: dayEnd },
    status: { $nin: ["cancelled"] },
  }).select("scheduledStart scheduledEnd");

  const bookedTimes = new Set(existingAppointments.map((a) => a.scheduledStart.toISOString()));

  const slots = [];
  for (const rule of rules) {
    const [startH, startM] = rule.startTime.split(":").map(Number);
    const [endH, endM] = rule.endTime.split(":").map(Number);
    let cursor = new Date(targetDate);
    cursor.setHours(startH, startM, 0, 0);
    const end = new Date(targetDate);
    end.setHours(endH, endM, 0, 0);

    while (cursor < end) {
      const slotEnd = new Date(cursor.getTime() + rule.slotDurationMinutes * 60000);
      if (slotEnd > end) break;
      slots.push({
        start: cursor.toISOString(),
        end: slotEnd.toISOString(),
        clinic: rule.clinic,
        available: !bookedTimes.has(cursor.toISOString()),
      });
      cursor = slotEnd;
    }
  }

  return ok(res, slots);
});

const submitVerificationDocuments = asyncHandler(async (req, res) => {
  const { documents } = req.body; // [{ type, fileRef }]
  if (!Array.isArray(documents) || !documents.length) {
    throw new ApiError(400, "DOCUMENTS_REQUIRED", "At least one document is required");
  }

  const doctor = await DoctorProfile.findOne({ user: req.user.id });
  if (!doctor) throw new ApiError(404, "NOT_FOUND", "Create your doctor profile first");

  doctor.verification.documents.push(...documents);
  doctor.verification.status = "pending";
  await doctor.save();

  return ok(res, doctor.verification, "Documents submitted for verification");
});

module.exports = {
  search,
  getOne,
  getMyProfile,
  upsertMyProfile,
  getAvailability,
  submitVerificationDocuments,
  setLiveStatus,
};
