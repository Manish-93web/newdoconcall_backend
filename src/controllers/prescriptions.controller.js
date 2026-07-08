const Prescription = require("../models/Prescription");
const Appointment = require("../models/Appointment");
const DoctorProfile = require("../models/DoctorProfile");
const HealthRecord = require("../models/HealthRecord");
const UploadedFile = require("../models/UploadedFile");
const User = require("../models/User");
const { generatePrescriptionPdf } = require("../services/pdf/prescriptionPdf.service");
const { notify } = require("../services/notification/notification.service");
const { ok, created, ApiError } = require("../utils/apiResponse");
const { parsePagination, buildMeta } = require("../utils/pagination");
const asyncHandler = require("../utils/asyncHandler");
const { NOTIFICATION_CHANNELS } = require("../config/constants");

const create = asyncHandler(async (req, res) => {
  const { appointmentId, consultationSessionId, medicines, diagnosis, advice, followUpInstructions } = req.body;

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw new ApiError(404, "NOT_FOUND", "Appointment not found");

  const doctor = await DoctorProfile.findOne({ user: req.user.id });
  if (!doctor || doctor._id.toString() !== appointment.doctor.toString()) {
    throw new ApiError(403, "FORBIDDEN", "Only the treating doctor can issue this prescription");
  }

  const prescription = await Prescription.create({
    consultationSession: consultationSessionId || null,
    appointment: appointmentId,
    doctor: doctor._id,
    patient: appointment.patient,
    forFamilyMember: appointment.forFamilyMember,
    medicines,
    diagnosis,
    advice,
    followUpInstructions,
  });

  const [doctorUser, patientUser, signatureFile] = await Promise.all([
    User.findById(req.user.id).select("name"),
    User.findById(appointment.patient).select("name"),
    doctor.signatureImage ? UploadedFile.findById(doctor.signatureImage).select("path") : null,
  ]);

  const { relativePath, mimetype, size } = await generatePrescriptionPdf({
    prescription,
    doctorName: doctorUser.name,
    patientName: patientUser.name,
    registrationNumber: doctor.registrationNumber,
    signatureImagePath: signatureFile?.path || null,
  });

  const pdfFile = await UploadedFile.create({
    owner: appointment.patient,
    module: "prescription",
    storageProvider: "local",
    path: relativePath,
    originalName: `prescription-${prescription._id}.pdf`,
    mimetype,
    size,
  });

  prescription.pdfFile = pdfFile._id;
  await prescription.save();

  await HealthRecord.create({
    owner: appointment.patient,
    forFamilyMember: appointment.forFamilyMember,
    type: "prescription",
    title: `Prescription from Dr. ${doctorUser.name}`,
    sourcePrescription: prescription._id,
    fileRef: pdfFile._id,
    visibility: "shared_with_doctor",
  });

  await notify({
    userId: appointment.patient,
    channel: NOTIFICATION_CHANNELS.PUSH,
    type: "prescription_issued",
    title: "New e-prescription",
    body: `Dr. ${doctorUser.name} issued you a prescription`,
    data: { prescriptionId: prescription._id },
  });

  // Multi-channel delivery per spec 5.10 — text summary only (doctor name, date,
  // prompt to open the app), not the PDF binary itself: attaching the PDF via WhatsApp
  // media would require a public, unauthenticated file URL, which would undercut the
  // authenticated-file-access model the rest of the app relies on.
  await notify({
    userId: appointment.patient,
    channel: NOTIFICATION_CHANNELS.WHATSAPP,
    type: "prescription_issued",
    title: "New e-prescription",
    body: `Dr. ${doctorUser.name} issued your prescription on ${new Date().toLocaleDateString()}. Open the DoconCall app to view and download it.`,
    data: { prescriptionId: prescription._id },
  });

  return created(res, prescription, "Prescription issued");
});

const getOne = asyncHandler(async (req, res) => {
  const prescription = await Prescription.findById(req.params.id)
    .populate({ path: "doctor", populate: { path: "user", select: "name" } })
    .populate({ path: "patient", select: "name" });
  if (!prescription) throw new ApiError(404, "NOT_FOUND", "Prescription not found");

  const isPatient = prescription.patient._id.toString() === req.user.id;
  const doctor = await DoctorProfile.findById(prescription.doctor).select("user");
  const isDoctor = doctor && doctor.user.toString() === req.user.id;
  if (!isPatient && !isDoctor) throw new ApiError(403, "FORBIDDEN", "You cannot view this prescription");

  return ok(res, prescription);
});

const list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, appointmentId } = req.query;
  const { skip } = parsePagination({ page, limit });

  const query = {};
  const doctor = await DoctorProfile.findOne({ user: req.user.id }).select("_id");
  if (doctor) query.doctor = doctor._id;
  else query.patient = req.user.id;
  if (appointmentId) query.appointment = appointmentId;

  const [items, total] = await Promise.all([
    Prescription.find(query)
      .populate({ path: "doctor", populate: { path: "user", select: "name" } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Prescription.countDocuments(query),
  ]);

  return ok(res, items, "OK", buildMeta({ page: Number(page), limit: Number(limit), total }));
});

module.exports = { create, getOne, list };
