const ROLES = Object.freeze({
  PATIENT: "patient",
  DOCTOR: "doctor",
  CLINIC_ADMIN: "clinic_admin",
  CLINIC_STAFF: "clinic_staff",
  PLATFORM_ADMIN: "platform_admin",
});

const ALL_ROLES = Object.values(ROLES);

const APPOINTMENT_MODES = Object.freeze({
  IN_CLINIC: "in_clinic",
  VIDEO: "video",
  VOICE: "voice",
  CHAT: "chat",
});

const APPOINTMENT_STATUSES = Object.freeze({
  PENDING_PAYMENT: "pending_payment",
  CONFIRMED: "confirmed",
  RESCHEDULED: "rescheduled",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
  NO_SHOW: "no_show",
});

const CONSULTATION_STATES = Object.freeze({
  SCHEDULED: "scheduled",
  RINGING: "ringing",
  CONNECTED: "connected",
  ON_HOLD: "on_hold",
  ENDED: "ended",
  MISSED: "missed",
  FAILED: "failed",
});

const PAYMENT_PURPOSES = Object.freeze({
  APPOINTMENT: "appointment",
  PHARMACY_ORDER: "pharmacy_order",
  DIAGNOSTIC_BOOKING: "diagnostic_booking",
  CLINIC_SUBSCRIPTION: "clinic_subscription",
  DOCTOR_LISTING_FEE: "doctor_listing_fee",
  PATIENT_SUBSCRIPTION: "patient_subscription",
});

const PAYMENT_STATUSES = Object.freeze({
  REQUIRES_PAYMENT: "requires_payment",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  REFUNDED: "refunded",
});

const NOTIFICATION_CHANNELS = Object.freeze({
  PUSH: "push",
  SMS: "sms",
  EMAIL: "email",
  IN_APP: "in_app",
  WHATSAPP: "whatsapp",
});

const VERIFICATION_STATUSES = Object.freeze({
  PENDING: "pending",
  VERIFIED: "verified",
  REJECTED: "rejected",
});

module.exports = {
  ROLES,
  ALL_ROLES,
  APPOINTMENT_MODES,
  APPOINTMENT_STATUSES,
  CONSULTATION_STATES,
  PAYMENT_PURPOSES,
  PAYMENT_STATUSES,
  NOTIFICATION_CHANNELS,
  VERIFICATION_STATUSES,
};
