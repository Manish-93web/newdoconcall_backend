const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/rbac.middleware");
const { validate } = require("../middleware/validate.middleware");
const { ROLES } = require("../config/constants");
const { createHealthTagSchema, updateHealthTagSchema } = require("../validators/healthTag.validators");
const ctrl = require("../controllers/healthTags.controller");

const adminOnly = allowRoles(ROLES.PLATFORM_ADMIN);

router.get("/", ctrl.list);
router.post("/", authenticate(), adminOnly, validate(createHealthTagSchema), ctrl.create);
router.patch("/:id", authenticate(), adminOnly, validate(updateHealthTagSchema), ctrl.update);
router.delete("/:id", authenticate(), adminOnly, ctrl.remove);

module.exports = router;
