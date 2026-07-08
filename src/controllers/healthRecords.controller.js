const HealthRecord = require("../models/HealthRecord");
const Appointment = require("../models/Appointment");
const DoctorProfile = require("../models/DoctorProfile");
const { ok, created, ApiError } = require("../utils/apiResponse");
const { parsePagination, buildMeta } = require("../utils/pagination");
const asyncHandler = require("../utils/asyncHandler");
const { ROLES } = require("../config/constants");

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

// Lets a doctor view a patient's health locker — but only once they've actually
// treated that patient (proven by a completed appointment between them), mirroring
// the same permission check `create` already applies to doctor_note creation.
const listForPatient = asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const { skip } = parsePagination({ page, limit });

  const doctorProfile = await DoctorProfile.findOne({ user: req.user.id }).select("_id");
  if (!doctorProfile) throw new ApiError(403, "FORBIDDEN", "Doctor profile not found");

  const treated = await Appointment.exists({
    doctor: doctorProfile._id,
    patient: patientId,
    status: "completed",
  });
  if (!treated) throw new ApiError(403, "FORBIDDEN", "You have not treated this patient");

  const query = { owner: patientId };
  const [records, total] = await Promise.all([
    HealthRecord.find(query).sort({ recordDate: -1 }).skip(skip).limit(Number(limit)),
    HealthRecord.countDocuments(query),
  ]);

  return ok(res, records, "OK", buildMeta({ page: Number(page), limit: Number(limit), total }));
});

const create = asyncHandler(async (req, res) => {
  const { appointmentId, ...body } = req.body;

  // A doctor may attach a note to a *patient's* locker, but only for a patient they've
  // actually treated — proven by passing a completed appointment they're the doctor on.
  // Every other caller (patients managing their own locker) keeps owner = themselves.
  if (req.user.role === ROLES.DOCTOR && appointmentId) {
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) throw new ApiError(404, "NOT_FOUND", "Appointment not found");

    const doctorProfile = await DoctorProfile.findOne({ user: req.user.id }).select("_id");
    if (!doctorProfile || appointment.doctor.toString() !== doctorProfile._id.toString()) {
      throw new ApiError(403, "FORBIDDEN", "You did not treat this patient");
    }
    if (appointment.status !== "completed") {
      throw new ApiError(400, "APPOINTMENT_NOT_COMPLETED", "You can only add a note after completing the visit");
    }

    const record = await HealthRecord.create({
      ...body,
      type: "doctor_note",
      owner: appointment.patient,
      forFamilyMember: appointment.forFamilyMember,
      visibility: "shared_with_doctor",
    });
    return created(res, record);
  }

  const record = await HealthRecord.create({ ...body, owner: req.user.id });
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
  const hasGrant = record.accessGrants.some(
    (g) => g.grantedTo.toString() === req.user.id && (!g.expiresAt || g.expiresAt > new Date())
  );
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

module.exports = { list, listForPatient, create, getOne, remove, share };
