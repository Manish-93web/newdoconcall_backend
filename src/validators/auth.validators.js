const Joi = require("joi");
const { ROLES } = require("../config/constants");

const identifierField = Joi.string().required();

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().optional(),
  phone: Joi.string()
    .pattern(/^[0-9+\-\s]{7,15}$/)
    .optional(),
  password: Joi.string().min(6).required(),
  role: Joi.string()
    .valid(ROLES.PATIENT, ROLES.DOCTOR, ROLES.CLINIC_ADMIN)
    .default(ROLES.PATIENT),
})
  .or("email", "phone")
  .required();

const otpRequestSchema = Joi.object({
  identifier: identifierField,
  purpose: Joi.string().valid("signup", "login", "reset").default("login"),
  // Which client is asking — used only to pick an SMS auto-read format (WebOTP vs. Android
  // SMS Retriever); omit from the mobile app to keep its existing behavior unchanged.
  platform: Joi.string().valid("web", "mobile").optional(),
});

const otpVerifySchema = Joi.object({
  identifier: identifierField,
  purpose: Joi.string().valid("signup", "login", "reset").default("login"),
  code: Joi.string().length(6).required(),
  // required only when purpose = signup and the user doesn't exist yet
  name: Joi.string().min(2).max(100).optional(),
  role: Joi.string().valid(ROLES.PATIENT, ROLES.DOCTOR).optional(),
});

const loginSchema = Joi.object({
  identifier: identifierField,
  password: Joi.string().min(6).required(),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

const resetPasswordSchema = Joi.object({
  identifier: identifierField,
  code: Joi.string().length(6).required(),
  newPassword: Joi.string().min(6).required(),
});

const googleLoginSchema = Joi.object({
  idToken: Joi.string().required(),
  role: Joi.string().valid(ROLES.PATIENT, ROLES.DOCTOR).optional(),
});

const appleLoginSchema = Joi.object({
  idToken: Joi.string().required(),
  role: Joi.string().valid(ROLES.PATIENT, ROLES.DOCTOR).optional(),
  // Apple only ever includes this on the client's very first authorization.
  fullName: Joi.object({
    givenName: Joi.string().allow("").optional(),
    familyName: Joi.string().allow("").optional(),
  }).optional(),
});

module.exports = {
  registerSchema,
  otpRequestSchema,
  otpVerifySchema,
  loginSchema,
  refreshSchema,
  resetPasswordSchema,
  googleLoginSchema,
  appleLoginSchema,
};
