const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/rbac.middleware");
const { validate } = require("../middleware/validate.middleware");
const { ROLES } = require("../config/constants");
const { createPrescriptionSchema } = require("../validators/prescription.validators");
const ctrl = require("../controllers/prescriptions.controller");

router.use(authenticate());
router.post("/", allowRoles(ROLES.DOCTOR), validate(createPrescriptionSchema), ctrl.create);
router.get("/", ctrl.list);
router.get("/:id", ctrl.getOne);

module.exports = router;
