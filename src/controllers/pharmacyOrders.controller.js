const PharmacyOrder = require("../models/PharmacyOrder");
const Medicine = require("../models/Medicine");
const { computeSplit } = require("../services/commission/commission.service");
const { ok, created, ApiError } = require("../utils/apiResponse");
const { parsePagination, buildMeta } = require("../utils/pagination");
const asyncHandler = require("../utils/asyncHandler");
const { ROLES } = require("../config/constants");

const DELIVERY_FEE_THRESHOLD = 500;
const FLAT_DELIVERY_FEE = 40;

const create = asyncHandler(async (req, res) => {
  const { forFamilyMemberId, items, deliveryAddress, prescriptionUploadId, linkedPrescriptionId, refillReminder } =
    req.body;

  const medicineIds = items.map((i) => i.medicineId);
  const medicines = await Medicine.find({ _id: { $in: medicineIds } });
  if (medicines.length !== medicineIds.length) {
    throw new ApiError(404, "MEDICINE_NOT_FOUND", "One or more medicines could not be found");
  }

  const requiresPrescription = medicines.some((m) => m.prescriptionRequired);
  if (requiresPrescription && !prescriptionUploadId && !linkedPrescriptionId) {
    throw new ApiError(
      400,
      "PRESCRIPTION_REQUIRED",
      "One or more medicines in this order require a prescription upload"
    );
  }

  const orderItems = items.map(({ medicineId, quantity }) => {
    const medicine = medicines.find((m) => m._id.toString() === medicineId);
    return { medicine: medicine._id, quantity, unitPrice: medicine.price.sellingPrice };
  });

  const subtotal = orderItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const deliveryFee = subtotal >= DELIVERY_FEE_THRESHOLD ? 0 : FLAT_DELIVERY_FEE;
  const { commissionAmount } = await computeSplit("pharmacy_order", subtotal);
  const totalAmount = subtotal + deliveryFee;

  const order = await PharmacyOrder.create({
    patient: req.user.id,
    forFamilyMember: forFamilyMemberId || null,
    prescriptionUpload: prescriptionUploadId || null,
    linkedPrescription: linkedPrescriptionId || null,
    items: orderItems,
    subtotal,
    deliveryFee,
    commissionAmount,
    totalAmount,
    deliveryAddress,
    status: requiresPrescription && !linkedPrescriptionId ? "prescription_review" : "placed",
    trackingUpdates: [{ status: "placed", note: "Order placed" }],
    refillReminder:
      refillReminder?.enabled && refillReminder.intervalDays
        ? {
            enabled: true,
            intervalDays: refillReminder.intervalDays,
            nextReminderAt: new Date(Date.now() + refillReminder.intervalDays * 86400000),
          }
        : { enabled: false },
  });

  return created(res, order, "Order placed");
});

const list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const { skip } = parsePagination({ page, limit });

  const query = req.user.role === ROLES.PLATFORM_ADMIN ? {} : { patient: req.user.id };
  if (status) query.status = status;

  const [orders, total] = await Promise.all([
    PharmacyOrder.find(query)
      .populate("items.medicine")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    PharmacyOrder.countDocuments(query),
  ]);

  return ok(res, orders, "OK", buildMeta({ page: Number(page), limit: Number(limit), total }));
});

const getOne = asyncHandler(async (req, res) => {
  const order = await PharmacyOrder.findById(req.params.id).populate("items.medicine");
  if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found");
  if (order.patient.toString() !== req.user.id && req.user.role !== ROLES.PLATFORM_ADMIN) {
    throw new ApiError(403, "FORBIDDEN", "You cannot view this order");
  }
  return ok(res, order);
});

const updateStatus = asyncHandler(async (req, res) => {
  const order = await PharmacyOrder.findById(req.params.id);
  if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found");

  order.status = req.body.status;
  order.trackingUpdates.push({ status: req.body.status, note: req.body.note });
  await order.save();

  return ok(res, order, "Order status updated");
});

const reorder = asyncHandler(async (req, res) => {
  const original = await PharmacyOrder.findById(req.params.id);
  if (!original) throw new ApiError(404, "NOT_FOUND", "Order not found");
  if (original.patient.toString() !== req.user.id) {
    throw new ApiError(403, "FORBIDDEN", "You cannot reorder someone else's order");
  }

  const medicines = await Medicine.find({ _id: { $in: original.items.map((i) => i.medicine) } });
  const orderItems = original.items.map((i) => {
    const medicine = medicines.find((m) => m._id.toString() === i.medicine.toString());
    return { medicine: i.medicine, quantity: i.quantity, unitPrice: medicine.price.sellingPrice };
  });
  const subtotal = orderItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const deliveryFee = subtotal >= DELIVERY_FEE_THRESHOLD ? 0 : FLAT_DELIVERY_FEE;
  const { commissionAmount } = await computeSplit("pharmacy_order", subtotal);

  const newOrder = await PharmacyOrder.create({
    patient: req.user.id,
    forFamilyMember: original.forFamilyMember,
    linkedPrescription: original.linkedPrescription,
    items: orderItems,
    subtotal,
    deliveryFee,
    commissionAmount,
    totalAmount: subtotal + deliveryFee,
    deliveryAddress: original.deliveryAddress,
    status: "placed",
    trackingUpdates: [{ status: "placed", note: "Re-order placed" }],
  });

  return created(res, newOrder, "Order re-placed");
});

module.exports = { create, list, getOne, updateStatus, reorder };
