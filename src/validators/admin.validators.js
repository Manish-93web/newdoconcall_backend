const Joi = require("joi");

const createAdminSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().optional(),
  phone: Joi.string()
    .pattern(/^[0-9+\-\s]{7,15}$/)
    .optional(),
  password: Joi.string().min(6).required(),
})
  .or("email", "phone")
  .required();

const broadcastNotificationSchema = Joi.object({
  title: Joi.string().min(1).max(150).required(),
  body: Joi.string().min(1).max(1000).required(),
  channels: Joi.array().items(Joi.string().valid("push", "sms", "email", "in_app", "whatsapp")).min(1).required(),
  target: Joi.object({
    type: Joi.string().valid("role", "user", "all").required(),
    role: Joi.string().when("type", { is: "role", then: Joi.required() }),
    userId: Joi.string().when("type", { is: "user", then: Joi.required() }),
  }).required(),
});

const updateNotificationTemplateSchema = Joi.object({
  title: Joi.string().min(1).max(150),
  body: Joi.string().min(1).max(1000),
  channels: Joi.array().items(Joi.string().valid("push", "sms", "email", "in_app", "whatsapp")).min(1),
  isActive: Joi.boolean(),
}).min(1);

module.exports = {
  createAdminSchema,
  broadcastNotificationSchema,
  updateNotificationTemplateSchema,
};
