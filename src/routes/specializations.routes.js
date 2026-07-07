const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/rbac.middleware");
const { ROLES } = require("../config/constants");
const ctrl = require("../controllers/specializations.controller");

router.get("/", ctrl.list);
router.post("/", authenticate(), allowRoles(ROLES.PLATFORM_ADMIN), ctrl.create);

module.exports = router;
