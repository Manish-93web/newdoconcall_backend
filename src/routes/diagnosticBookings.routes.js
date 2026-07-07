const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/rbac.middleware");
const { validate } = require("../middleware/validate.middleware");
const { ROLES } = require("../config/constants");
const { createBookingSchema, updateStatusSchema } = require("../validators/diagnosticBooking.validators");
const ctrl = require("../controllers/diagnosticBookings.controller");

router.use(authenticate());
router.post("/", validate(createBookingSchema), ctrl.create);
router.get("/", ctrl.list);
router.get("/:id", ctrl.getOne);
router.get("/:id/report", ctrl.getReport);
router.patch("/:id/status", allowRoles(ROLES.PLATFORM_ADMIN), validate(updateStatusSchema), ctrl.updateStatus);

module.exports = router;
