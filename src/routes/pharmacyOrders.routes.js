const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/rbac.middleware");
const { validate } = require("../middleware/validate.middleware");
const { ROLES } = require("../config/constants");
const { createOrderSchema, updateStatusSchema } = require("../validators/pharmacy.validators");
const ctrl = require("../controllers/pharmacyOrders.controller");

router.use(authenticate());
router.post("/", validate(createOrderSchema), ctrl.create);
router.get("/", ctrl.list);
router.get("/:id", ctrl.getOne);
router.patch("/:id/status", allowRoles(ROLES.PLATFORM_ADMIN), validate(updateStatusSchema), ctrl.updateStatus);
router.post("/:id/reorder", ctrl.reorder);

module.exports = router;
