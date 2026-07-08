const Article = require("../models/Article");
const { ok, created, ApiError } = require("../utils/apiResponse");
const { parsePagination, buildMeta } = require("../utils/pagination");
const { sanitizeText } = require("../utils/sanitize");
const asyncHandler = require("../utils/asyncHandler");

function slugify(title) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") +
    "-" +
    Date.now().toString(36)
  );
}

const list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, category, tag } = req.query;
  const { skip } = parsePagination({ page, limit });

  const query = { status: "published" };
  if (category) query.category = category;
  if (tag) query.tags = tag;

  const [articles, total] = await Promise.all([
    Article.find(query)
      .populate("author", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Article.countDocuments(query),
  ]);

  return ok(res, articles, "OK", buildMeta({ page: Number(page), limit: Number(limit), total }));
});

const getBySlug = asyncHandler(async (req, res) => {
  const article = await Article.findOne({ slug: req.params.slug }).populate("author", "name");
  if (!article) throw new ApiError(404, "NOT_FOUND", "Article not found");
  return ok(res, article);
});

const create = asyncHandler(async (req, res) => {
  const article = await Article.create({
    ...req.body,
    title: sanitizeText(req.body.title),
    body: sanitizeText(req.body.body),
    slug: slugify(req.body.title),
    author: req.user.id,
  });
  return created(res, article);
});

async function assertOwnerOrAdmin(article, user) {
  if (article.author.toString() !== user.id && user.role !== "platform_admin") {
    throw new ApiError(403, "FORBIDDEN", "You cannot modify this article");
  }
}

const update = asyncHandler(async (req, res) => {
  const article = await Article.findById(req.params.id);
  if (!article) throw new ApiError(404, "NOT_FOUND", "Article not found");
  await assertOwnerOrAdmin(article, req.user);

  Object.assign(article, req.body);
  if (req.body.title) article.title = sanitizeText(req.body.title);
  if (req.body.body) article.body = sanitizeText(req.body.body);
  await article.save();
  return ok(res, article, "Article updated");
});

const remove = asyncHandler(async (req, res) => {
  const article = await Article.findById(req.params.id);
  if (!article) throw new ApiError(404, "NOT_FOUND", "Article not found");
  await assertOwnerOrAdmin(article, req.user);

  await article.deleteOne();
  return ok(res, null, "Article deleted");
});

module.exports = { list, getBySlug, create, update, remove };
