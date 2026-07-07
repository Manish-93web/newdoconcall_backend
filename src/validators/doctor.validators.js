const Joi = require("joi");

const addressSchema = Joi.object({
  line1: Joi.string().allow(""),
  city: Joi.string().allow(""),
  state: Joi.string().allow(""),
  pincode: Joi.string().allow(""),
});

const upsertDoctorSchema = Joi.object({
  specializations: Joi.array().items(Joi.string()).default([]),
  qualifications: Joi.array().items(
    Joi.object({ degree: Joi.string(), institute: Joi.string(), year: Joi.number() })
  ),
  registrationNumber: Joi.string().allow(""),
  registrationCouncil: Joi.string().allow(""),
  experienceYears: Joi.number().min(0),
  bio: Joi.string().allow(""),
  consultationFee: Joi.object({
    inClinic: Joi.number().min(0),
    video: Joi.number().min(0),
    voice: Joi.number().min(0),
    chat: Joi.number().min(0),
  }),
  address: addressSchema,
  availability: Joi.array().items(
    Joi.object({
      clinic: Joi.string().allow(null),
      dayOfWeek: Joi.number().min(0).max(6).required(),
      startTime: Joi.string().required(),
      endTime: Joi.string().required(),
      slotDurationMinutes: Joi.number().min(5).max(180).default(15),
    })
  ),
});

const searchDoctorsSchema = Joi.object({
  lat: Joi.number(),
  lng: Joi.number(),
  radiusKm: Joi.number().min(1).max(200).default(25),
  specialization: Joi.string(),
  minFee: Joi.number().min(0),
  maxFee: Joi.number().min(0),
  minRating: Joi.number().min(0).max(5),
  name: Joi.string(),
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
});

module.exports = { upsertDoctorSchema, searchDoctorsSchema };
