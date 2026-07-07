const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/rbac.middleware");
const { ROLES } = require("../config/constants");
const ctrl = require("../controllers/payouts.controller");

router.use(authenticate());
router.get("/", ctrl.list);
router.post("/generate", allowRoles(ROLES.PLATFORM_ADMIN), ctrl.generate);
router.patch("/:id/mark-paid", allowRoles(ROLES.PLATFORM_ADMIN), ctrl.markPaid);

module.exports = router;
