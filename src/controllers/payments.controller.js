const Payment = require("../models/Payment");
const Appointment = require("../models/Appointment");
const PharmacyOrder = require("../models/PharmacyOrder");
const DiagnosticBooking = require("../models/DiagnosticBooking");
const ClinicProfile = require("../models/ClinicProfile");
const DoctorProfile = require("../models/DoctorProfile");
const PlatformSetting = require("../models/PlatformSetting");
const { createPaymentIntent, constructWebhookEvent } = require("../services/payment/stripe.service");
const { computeSplit } = require("../services/commission/commission.service");
const { notify } = require("../services/notification/notification.service");
const { ok, created, ApiError } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");
const { PAYMENT_PURPOSES, PAYMENT_STATUSES, NOTIFICATION_CHANNELS, APPOINTMENT_STATUSES } = require("../config/constants");
const { createLogger } = require("../utils/logger");

const log = createLogger("payments");

const REFERENCE_MODEL = {
  [PAYMENT_PURPOSES.APPOINTMENT]: "Appointment",
  [PAYMENT_PURPOSES.PHARMACY_ORDER]: "PharmacyOrder",
  [PAYMENT_PURPOSES.DIAGNOSTIC_BOOKING]: "DiagnosticBooking",
  [PAYMENT_PURPOSES.CLINIC_SUBSCRIPTION]: "ClinicProfile",
  [PAYMENT_PURPOSES.DOCTOR_LISTING_FEE]: "DoctorProfile",
};

async function resolveAmountAndOwnership(purpose, referenceId, userId, planName) {
  switch (purpose) {
    case PAYMENT_PURPOSES.APPOINTMENT: {
      const appointment = await Appointment.findById(referenceId);
      if (!appointment) throw new ApiError(404, "NOT_FOUND", "Appointment not found");
      if (appointment.patient.toString() !== userId) throw new ApiError(403, "FORBIDDEN", "Not your appointment");
      return { amount: appointment.fee.amount, doc: appointment };
    }
    case PAYMENT_PURPOSES.PHARMACY_ORDER: {
      const order = await PharmacyOrder.findById(referenceId);
      if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found");
      if (order.patient.toString() !== userId) throw new ApiError(403, "FORBIDDEN", "Not your order");
      return { amount: order.totalAmount, doc: order };
    }
    case PAYMENT_PURPOSES.DIAGNOSTIC_BOOKING: {
      const booking = await DiagnosticBooking.findById(referenceId);
      if (!booking) throw new ApiError(404, "NOT_FOUND", "Booking not found");
      if (booking.patient.toString() !== userId) throw new ApiError(403, "FORBIDDEN", "Not your booking");
      return { amount: booking.totalAmount, doc: booking };
    }
    case PAYMENT_PURPOSES.CLINIC_SUBSCRIPTION: {
      const clinic = await ClinicProfile.findById(referenceId);
      if (!clinic) throw new ApiError(404, "NOT_FOUND", "Clinic not found");
      if (clinic.owner.toString() !== userId) throw new ApiError(403, "FORBIDDEN", "Not your clinic");
      const settings = await PlatformSetting.getSettings();
      const plan = settings.clinicSubscriptionPlans.find((p) => p.name === planName);
      if (!plan) throw new ApiError(400, "PLAN_NOT_FOUND", "Subscription plan not found");
      return { amount: plan.price, doc: clinic, plan };
    }
    case PAYMENT_PURPOSES.DOCTOR_LISTING_FEE: {
      const doctor = await DoctorProfile.findById(referenceId);
      if (!doctor) throw new ApiError(404, "NOT_FOUND", "Doctor profile not found");
      if (doctor.user.toString() !== userId) throw new ApiError(403, "FORBIDDEN", "Not your doctor profile");
      const settings = await PlatformSetting.getSettings();
      return { amount: settings.doctorListingFee, doc: doctor };
    }
    default:
      throw new ApiError(400, "INVALID_PURPOSE", "Unsupported payment purpose");
  }
}

const createIntent = asyncHandler(async (req, res) => {
  const { purpose, referenceId, planName } = req.body;
  const { amount } = await resolveAmountAndOwnership(purpose, referenceId, req.user.id, planName);

  const { commissionAmount, netToProvider } = await computeSplit(purpose, amount);

  const payment = await Payment.create({
    user: req.user.id,
    purpose,
    referenceModel: REFERENCE_MODEL[purpose],
    referenceId,
    amount,
    commissionAmount,
    netToProvider,
    status: PAYMENT_STATUSES.REQUIRES_PAYMENT,
  });

  const intent = await createPaymentIntent({
    amount,
    metadata: { paymentId: payment._id.toString(), purpose, referenceId },
  });

  payment.stripePaymentIntentId = intent.id;
  await payment.save();

  return created(res, { paymentId: payment._id, clientSecret: intent.client_secret, amount }, "Payment intent created");
});

async function applySideEffect(payment) {
  switch (payment.purpose) {
    case PAYMENT_PURPOSES.APPOINTMENT: {
      const appointment = await Appointment.findByIdAndUpdate(payment.referenceId, {
        status: APPOINTMENT_STATUSES.CONFIRMED,
        payment: payment._id,
      });
      if (appointment) {
        await notify({
          userId: appointment.patient,
          channel: NOTIFICATION_CHANNELS.PUSH,
          type: "payment_succeeded",
          title: "Payment successful",
          body: "Your appointment is confirmed.",
          data: { appointmentId: appointment._id },
        });
      }
      break;
    }
    case PAYMENT_PURPOSES.PHARMACY_ORDER: {
      const order = await PharmacyOrder.findById(payment.referenceId);
      if (order) {
        order.payment = payment._id;
        if (order.status === "placed") order.status = "confirmed";
        order.trackingUpdates.push({ status: order.status, note: "Payment received" });
        await order.save();
      }
      break;
    }
    case PAYMENT_PURPOSES.DIAGNOSTIC_BOOKING: {
      await DiagnosticBooking.findByIdAndUpdate(payment.referenceId, { payment: payment._id });
      break;
    }
    case PAYMENT_PURPOSES.CLINIC_SUBSCRIPTION: {
      await ClinicProfile.findByIdAndUpdate(payment.referenceId, {
        "subscriptionPlan.status": "active",
        "subscriptionPlan.currentPeriodEnd": new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      break;
    }
    case PAYMENT_PURPOSES.DOCTOR_LISTING_FEE: {
      await DoctorProfile.findByIdAndUpdate(payment.referenceId, { listingFeeStatus: "paid", isListed: true });
      break;
    }
  }
}

const webhook = asyncHandler(async (req, res) => {
  const signature = req.headers["stripe-signature"];
  let event;
  try {
    event = constructWebhookEvent(req.body, signature);
  } catch (err) {
    log.error("Webhook signature verification failed", err.message);
    throw new ApiError(400, "INVALID_WEBHOOK_SIGNATURE", "Webhook signature verification failed");
  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const payment = await Payment.findOne({ stripePaymentIntentId: intent.id });
    if (payment && payment.status !== PAYMENT_STATUSES.SUCCEEDED) {
      payment.status = PAYMENT_STATUSES.SUCCEEDED;
      payment.stripeChargeId = intent.latest_charge;
      await payment.save();
      await applySideEffect(payment);
    }
  } else if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object;
    await Payment.findOneAndUpdate({ stripePaymentIntentId: intent.id }, { status: PAYMENT_STATUSES.FAILED });
  }

  return ok(res, { received: true });
});

const getOne = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id);
  if (!payment) throw new ApiError(404, "NOT_FOUND", "Payment not found");
  if (payment.user.toString() !== req.user.id && req.user.role !== "platform_admin") {
    throw new ApiError(403, "FORBIDDEN", "You cannot view this payment");
  }
  return ok(res, payment);
});

module.exports = { createIntent, webhook, getOne };
