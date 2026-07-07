const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/rbac.middleware");
const { validate } = require("../middleware/validate.middleware");
const { ROLES } = require("../config/constants");
const { upsertDoctorSchema, searchDoctorsSchema } = require("../validators/doctor.validators");
const ctrl = require("../controllers/doctors.controller");
const payoutsCtrl = require("../controllers/payouts.controller");

router.get("/", validate(searchDoctorsSchema, "query"), ctrl.search);
router.get("/me", authenticate(), allowRoles(ROLES.DOCTOR), ctrl.getMyProfile);
router.get("/me/earnings", authenticate(), allowRoles(ROLES.DOCTOR), payoutsCtrl.doctorEarningsSummary);
router.put(
  "/me",
  authenticate(),
  allowRoles(ROLES.DOCTOR),
  validate(upsertDoctorSchema),
  ctrl.upsertMyProfile
);
router.post(
  "/me/verification-documents",
  authenticate(),
  allowRoles(ROLES.DOCTOR),
  ctrl.submitVerificationDocuments
);
router.get("/:id", ctrl.getOne);
router.get("/:id/availability", ctrl.getAvailability);

module.exports = router;
