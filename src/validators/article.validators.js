const Joi = require("joi");

const upsertArticleSchema = Joi.object({
  title: Joi.string().required(),
  body: Joi.string().required(),
  coverImage: Joi.string().allow(""),
  tags: Joi.array().items(Joi.string()).default([]),
  category: Joi.string().allow(""),
  status: Joi.string().valid("draft", "published").default("draft"),
});

module.exports = { upsertArticleSchema };
