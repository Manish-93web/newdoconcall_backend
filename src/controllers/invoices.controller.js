const Invoice = require("../models/Invoice");
const ClinicProfile = require("../models/ClinicProfile");
const { ok, created, ApiError } = require("../utils/apiResponse");
const { parsePagination, buildMeta } = require("../utils/pagination");
const { sanitizeText } = require("../utils/sanitize");
const asyncHandler = require("../utils/asyncHandler");
const { ROLES } = require("../config/constants");

function isOwnerStaffOrAdmin(clinic, user) {
  return (
    clinic.owner.toString() === user.id ||
    clinic.staff.some((s) => s.toString() === user.id) ||
    user.role === ROLES.PLATFORM_ADMIN
  );
}

async function assertClinicAccess(clinicId, user) {
  const clinic = await ClinicProfile.findById(clinicId);
  if (!clinic) throw new ApiError(404, "NOT_FOUND", "Clinic not found");
  if (!isOwnerStaffOrAdmin(clinic, user)) throw new ApiError(403, "FORBIDDEN", "You do not manage this clinic");
  return clinic;
}

function generateInvoiceNumber(clinicId) {
  return `INV-${clinicId.toString().slice(-4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}

const create = asyncHandler(async (req, res) => {
  const clinic = await assertClinicAccess(req.params.id, req.user);
  const { patientId, appointmentId, items, taxPercent, notes } = req.body;

  const subtotal = items.reduce((sum, item) => sum + item.unitAmount * (item.quantity || 1), 0);
  const taxAmount = Math.round(subtotal * (taxPercent / 100) * 100) / 100;
  const totalAmount = subtotal + taxAmount;

  const invoice = await Invoice.create({
    clinic: clinic._id,
    patient: patientId,
    appointment: appointmentId || null,
    invoiceNumber: generateInvoiceNumber(clinic._id),
    items,
    taxPercent,
    subtotal,
    taxAmount,
    totalAmount,
    notes: sanitizeText(notes),
    issuedBy: req.user.id,
  });

  return created(res, invoice, "Invoice created");
});

const listForClinic = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const { skip } = parsePagination({ page, limit });
  await assertClinicAccess(req.params.id, req.user);

  const query = { clinic: req.params.id };
  if (status) query.status = status;

  const [invoices, total] = await Promise.all([
    Invoice.find(query).populate("patient", "name email phone").sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Invoice.countDocuments(query),
  ]);

  return ok(res, invoices, "OK", buildMeta({ page: Number(page), limit: Number(limit), total }));
});

const listMine = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const { skip } = parsePagination({ page, limit });

  const query = { patient: req.user.id };
  const [invoices, total] = await Promise.all([
    Invoice.find(query).populate("clinic", "name").sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Invoice.countDocuments(query),
  ]);

  return ok(res, invoices, "OK", buildMeta({ page: Number(page), limit: Number(limit), total }));
});

const getOne = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id).populate("patient", "name email phone").populate("clinic", "name address");
  if (!invoice) throw new ApiError(404, "NOT_FOUND", "Invoice not found");

  const isPatient = invoice.patient._id.toString() === req.user.id;
  if (!isPatient) await assertClinicAccess(invoice.clinic._id, req.user);

  return ok(res, invoice);
});

const markPaid = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw new ApiError(404, "NOT_FOUND", "Invoice not found");
  await assertClinicAccess(invoice.clinic, req.user);

  invoice.status = "paid";
  invoice.paidAt = new Date();
  await invoice.save();

  return ok(res, invoice, "Invoice marked paid");
});

module.exports = { create, listForClinic, listMine, getOne, markPaid };
