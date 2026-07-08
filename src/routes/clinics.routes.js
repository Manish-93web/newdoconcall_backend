const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/rbac.middleware");
const { validate } = require("../middleware/validate.middleware");
const { ROLES } = require("../config/constants");
const { upsertClinicSchema, addStaffSchema } = require("../validators/clinic.validators");
const { createInvoiceSchema } = require("../validators/invoice.validators");
const ctrl = require("../controllers/clinics.controller");
const invoicesCtrl = require("../controllers/invoices.controller");

const manageRoles = allowRoles(ROLES.CLINIC_ADMIN, ROLES.PLATFORM_ADMIN);
// Clinic staff can view their clinic's own data but not manage doctors/staff/settings —
// those mutations stay owner/admin-only via manageRoles above.
const viewRoles = allowRoles(ROLES.CLINIC_ADMIN, ROLES.CLINIC_STAFF, ROLES.PLATFORM_ADMIN);

router.get("/", ctrl.list);
router.get("/mine", authenticate(), viewRoles, ctrl.listMine);
router.post("/", authenticate(), manageRoles, validate(upsertClinicSchema), ctrl.create);
router.get("/:id", ctrl.getOne);
router.patch("/:id", authenticate(), manageRoles, validate(upsertClinicSchema), ctrl.update);
router.get("/:id/analytics", authenticate(), viewRoles, ctrl.getAnalytics);
router.get("/:id/doctors", ctrl.getDoctors);
router.post("/:id/doctors", authenticate(), manageRoles, ctrl.addDoctor);
router.delete("/:id/doctors/:doctorId", authenticate(), manageRoles, ctrl.removeDoctor);
router.get("/:id/staff", authenticate(), viewRoles, ctrl.getStaff);
router.post("/:id/staff", authenticate(), manageRoles, validate(addStaffSchema), ctrl.addStaff);
router.delete("/:id/staff/:userId", authenticate(), manageRoles, ctrl.removeStaff);
router.get("/:id/invoices", authenticate(), viewRoles, invoicesCtrl.listForClinic);
router.post("/:id/invoices", authenticate(), viewRoles, validate(createInvoiceSchema), invoicesCtrl.create);

module.exports = router;
