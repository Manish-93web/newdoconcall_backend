const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/rbac.middleware");
const { validate } = require("../middleware/validate.middleware");
const { updatePlatformSettingsSchema } = require("../validators/platformSettings.validators");
const { createAdminSchema, broadcastNotificationSchema, updateNotificationTemplateSchema } = require("../validators/admin.validators");
const { createAffiliateSchema, updateAffiliateSchema, linkAffiliateSchema } = require("../validators/affiliate.validators");
const { ROLES } = require("../config/constants");
const ctrl = require("../controllers/admin.controller");
const affiliateCtrl = require("../controllers/affiliates.controller");

router.use(authenticate(), allowRoles(ROLES.PLATFORM_ADMIN));

router.get("/platform-settings", ctrl.getSettings);
router.patch("/platform-settings", validate(updatePlatformSettingsSchema), ctrl.updateSettings);

router.get("/users", ctrl.listUsers);
router.post("/users", validate(createAdminSchema), ctrl.createAdmin);
router.patch("/users/:id/suspend", ctrl.suspendUser);
router.patch("/users/:id/reactivate", ctrl.reactivateUser);

router.get("/doctors/pending-verification", ctrl.pendingDoctors);
router.patch("/doctors/:id/verify", ctrl.verifyDoctor);
router.patch("/doctors/:id/reject", ctrl.rejectDoctor);

router.get("/clinics/pending-verification", ctrl.pendingClinics);
router.patch("/clinics/:id/verify", ctrl.verifyClinic);
router.patch("/clinics/:id/reject", ctrl.rejectClinic);

router.get("/appointments", ctrl.listAppointments);
router.get("/consultation-sessions/live", ctrl.liveConsultations);
router.get("/payments", ctrl.listPayments);
router.get("/payments/export", ctrl.exportPayments);
router.get("/analytics/overview", ctrl.analyticsOverview);

router.get("/audit-logs", ctrl.listAuditLogs);

router.post("/notifications/broadcast", validate(broadcastNotificationSchema), ctrl.broadcastNotification);
router.get("/notification-templates", ctrl.listNotificationTemplates);
router.patch("/notification-templates/:id", validate(updateNotificationTemplateSchema), ctrl.updateNotificationTemplate);

router.get("/affiliates", affiliateCtrl.list);
router.post("/affiliates", validate(createAffiliateSchema), affiliateCtrl.create);
router.patch("/affiliates/:id", validate(updateAffiliateSchema), affiliateCtrl.update);
router.patch("/affiliates/:id/link", validate(linkAffiliateSchema), affiliateCtrl.link);
router.get("/affiliates/:id/commissions", affiliateCtrl.commissions);

module.exports = router;
