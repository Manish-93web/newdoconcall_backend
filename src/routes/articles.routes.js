const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/rbac.middleware");
const { validate } = require("../middleware/validate.middleware");
const { ROLES } = require("../config/constants");
const { upsertArticleSchema } = require("../validators/article.validators");
const ctrl = require("../controllers/articles.controller");

const authorRoles = allowRoles(ROLES.DOCTOR, ROLES.PLATFORM_ADMIN);

router.get("/", ctrl.list);
router.get("/:slug", ctrl.getBySlug);
router.post("/", authenticate(), authorRoles, validate(upsertArticleSchema), ctrl.create);
router.patch("/:id", authenticate(), authorRoles, validate(upsertArticleSchema), ctrl.update);
router.delete("/:id", authenticate(), authorRoles, ctrl.remove);

module.exports = router;
