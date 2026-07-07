const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/rbac.middleware");
const { validate } = require("../middleware/validate.middleware");
const { ROLES } = require("../config/constants");
const { createComplaintSchema, resolveComplaintSchema } = require("../validators/complaint.validators");
const ctrl = require("../controllers/complaints.controller");

router.use(authenticate());
router.post("/", validate(createComplaintSchema), ctrl.create);
router.get("/", ctrl.list);
router.patch("/:id/resolve", allowRoles(ROLES.PLATFORM_ADMIN), validate(resolveComplaintSchema), ctrl.resolve);

module.exports = router;
