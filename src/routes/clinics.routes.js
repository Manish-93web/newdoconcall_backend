const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/rbac.middleware");
const { validate } = require("../middleware/validate.middleware");
const { ROLES } = require("../config/constants");
const { upsertClinicSchema, addStaffSchema } = require("../validators/clinic.validators");
const ctrl = require("../controllers/clinics.controller");

const manageRoles = allowRoles(ROLES.CLINIC_ADMIN, ROLES.PLATFORM_ADMIN);

router.get("/", ctrl.list);
router.get("/mine", authenticate(), manageRoles, ctrl.listMine);
router.post("/", authenticate(), manageRoles, validate(upsertClinicSchema), ctrl.create);
router.get("/:id", ctrl.getOne);
router.patch("/:id", authenticate(), manageRoles, validate(upsertClinicSchema), ctrl.update);
router.get("/:id/doctors", ctrl.getDoctors);
router.post("/:id/doctors", authenticate(), manageRoles, ctrl.addDoctor);
router.delete("/:id/doctors/:doctorId", authenticate(), manageRoles, ctrl.removeDoctor);
router.get("/:id/staff", authenticate(), manageRoles, ctrl.getStaff);
router.post("/:id/staff", authenticate(), manageRoles, validate(addStaffSchema), ctrl.addStaff);
router.delete("/:id/staff/:userId", authenticate(), manageRoles, ctrl.removeStaff);

module.exports = router;
