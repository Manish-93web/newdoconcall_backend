const Joi = require("joi");
const { APPOINTMENT_MODES } = require("../config/constants");

const bookAppointmentSchema = Joi.object({
  doctorId: Joi.string().required(),
  clinicId: Joi.string().allow(null),
  forFamilyMemberId: Joi.string().allow(null),
  mode: Joi.string()
    .valid(...Object.values(APPOINTMENT_MODES))
    .required(),
  scheduledStart: Joi.date().iso().required(),
  scheduledEnd: Joi.date().iso().greater(Joi.ref("scheduledStart")).required(),
  bookingType: Joi.string().valid("scheduled", "instant").default("scheduled"),
  parentAppointmentId: Joi.string().allow(null),
});

const rescheduleSchema = Joi.object({
  scheduledStart: Joi.date().iso().required(),
  scheduledEnd: Joi.date().iso().greater(Joi.ref("scheduledStart")).required(),
});

const cancelSchema = Joi.object({
  reason: Joi.string().allow("").max(500),
});

const rejectSchema = Joi.object({
  reason: Joi.string().allow("").max(500),
});

const bookInstantSchema = Joi.object({
  specializationId: Joi.string().required(),
  mode: Joi.string()
    .valid(...Object.values(APPOINTMENT_MODES).filter((m) => m !== "in_clinic"))
    .required(),
  doctorId: Joi.string(),
});

const messagePatientSchema = Joi.object({
  message: Joi.string().trim().min(1).max(500).required(),
});

module.exports = {
  bookAppointmentSchema,
  rescheduleSchema,
  cancelSchema,
  rejectSchema,
  bookInstantSchema,
  messagePatientSchema,
};
