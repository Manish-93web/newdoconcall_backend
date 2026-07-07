const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/rbac.middleware");
const { ROLES } = require("../config/constants");
const ctrl = require("../controllers/admin.controller");

router.use(authenticate(), allowRoles(ROLES.PLATFORM_ADMIN));

router.get("/users", ctrl.listUsers);
router.patch("/users/:id/suspend", ctrl.suspendUser);
router.patch("/users/:id/reactivate", ctrl.reactivateUser);

router.get("/doctors/pending-verification", ctrl.pendingDoctors);
router.patch("/doctors/:id/verify", ctrl.verifyDoctor);
router.patch("/doctors/:id/reject", ctrl.rejectDoctor);

router.get("/clinics/pending-verification", ctrl.pendingClinics);
router.patch("/clinics/:id/verify", ctrl.verifyClinic);
router.patch("/clinics/:id/reject", ctrl.rejectClinic);

router.get("/appointments", ctrl.listAppointments);
router.get("/payments", ctrl.listPayments);
router.get("/analytics/overview", ctrl.analyticsOverview);

module.exports = router;
