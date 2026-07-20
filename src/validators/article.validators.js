const Joi = require("joi");

const upsertArticleSchema = Joi.object({
  title: Joi.string().required(),
  body: Joi.string().required(),
  coverImage: Joi.string().allow(""),
  // No .default([])/.default("draft") here deliberately — see reviewedBy's comment below:
  // update()'s Object.assign(article, req.body) would otherwise silently reset tags/status
  // to their defaults on every partial PATCH that omits them. Mongoose's own schema
  // defaults (status: "draft", tags: implicitly []) still cover create().
  tags: Joi.array().items(Joi.string()),
  category: Joi.string().allow(""),
  status: Joi.string().valid("draft", "published"),
  // A DoctorProfile id — the medical expert who reviewed this article (spec 4.8:
  // "Articles are written or reviewed by medical experts"). Without this field here, Joi's
  // stripUnknown discarded it silently on every request; it could never be persisted.
  // No .default() here deliberately — update() does Object.assign(article, req.body), so
  // defaulting a value would overwrite an existing reviewedBy on every unrelated PATCH
  // that simply omits this field. Mongoose's own schema default (null) covers create().
  reviewedBy: Joi.string().allow(null).empty(""),
});

module.exports = { upsertArticleSchema };
