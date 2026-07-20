const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles, requireCapability, requireFullAdmin } = require("../middleware/rbac.middleware");
const { validate } = require("../middleware/validate.middleware");
const { updatePlatformSettingsSchema } = require("../validators/platformSettings.validators");
const {
  createAdminSchema,
  updateAdminCapabilitiesSchema,
  broadcastNotificationSchema,
  updateNotificationTemplateSchema,
} = require("../validators/admin.validators");
const { createAffiliateSchema, updateAffiliateSchema, linkAffiliateSchema } = require("../validators/affiliate.validators");
const { ROLES, ADMIN_CAPABILITIES } = require("../config/constants");
const ctrl = require("../controllers/admin.controller");
const affiliateCtrl = require("../controllers/affiliates.controller");

router.use(authenticate(), allowRoles(ROLES.PLATFORM_ADMIN));

// Enumerates possible capability values for the sub-admin creation/edit UI — harmless to
// any platform_admin regardless of their own capabilities.
router.get("/capabilities", ctrl.listAdminCapabilities);

router.get("/platform-settings", ctrl.getSettings);
router.patch(
  "/platform-settings",
  requireCapability(ADMIN_CAPABILITIES.MANAGE_PLATFORM_SETTINGS),
  validate(updatePlatformSettingsSchema),
  ctrl.updateSettings
);

router.get("/users", requireCapability(ADMIN_CAPABILITIES.MANAGE_USERS), ctrl.listUsers);
// Creating a new admin account (full or capability-scoped) and editing an existing
// admin's capabilities are both full-admin-only — see requireFullAdmin's docstring.
router.post("/users", requireFullAdmin, validate(createAdminSchema), ctrl.createAdmin);
router.patch("/users/:id/capabilities", requireFullAdmin, validate(updateAdminCapabilitiesSchema), ctrl.updateAdminCapabilities);
router.patch("/users/:id/suspend", requireCapability(ADMIN_CAPABILITIES.MANAGE_USERS), ctrl.suspendUser);
router.patch("/users/:id/reactivate", requireCapability(ADMIN_CAPABILITIES.MANAGE_USERS), ctrl.reactivateUser);

router.get("/doctors/pending-verification", requireCapability(ADMIN_CAPABILITIES.MANAGE_VERIFICATION), ctrl.pendingDoctors);
router.patch("/doctors/:id/verify", requireCapability(ADMIN_CAPABILITIES.MANAGE_VERIFICATION), ctrl.verifyDoctor);
router.patch("/doctors/:id/reject", requireCapability(ADMIN_CAPABILITIES.MANAGE_VERIFICATION), ctrl.rejectDoctor);

router.get("/clinics/pending-verification", requireCapability(ADMIN_CAPABILITIES.MANAGE_VERIFICATION), ctrl.pendingClinics);
router.patch("/clinics/:id/verify", requireCapability(ADMIN_CAPABILITIES.MANAGE_VERIFICATION), ctrl.verifyClinic);
router.patch("/clinics/:id/reject", requireCapability(ADMIN_CAPABILITIES.MANAGE_VERIFICATION), ctrl.rejectClinic);

router.get("/appointments", requireCapability(ADMIN_CAPABILITIES.MONITOR_CONSULTATIONS), ctrl.listAppointments);
router.get("/consultation-sessions/live", requireCapability(ADMIN_CAPABILITIES.MONITOR_CONSULTATIONS), ctrl.liveConsultations);
router.get("/payments", requireCapability(ADMIN_CAPABILITIES.VIEW_FINANCIALS), ctrl.listPayments);
router.get("/payments/export", requireCapability(ADMIN_CAPABILITIES.VIEW_FINANCIALS), ctrl.exportPayments);
router.get("/analytics/overview", requireCapability(ADMIN_CAPABILITIES.VIEW_FINANCIALS), ctrl.analyticsOverview);

router.get("/audit-logs", requireCapability(ADMIN_CAPABILITIES.VIEW_AUDIT_LOGS), ctrl.listAuditLogs);

router.post(
  "/notifications/broadcast",
  requireCapability(ADMIN_CAPABILITIES.MANAGE_NOTIFICATIONS),
  validate(broadcastNotificationSchema),
  ctrl.broadcastNotification
);
router.get("/notification-templates", requireCapability(ADMIN_CAPABILITIES.MANAGE_NOTIFICATIONS), ctrl.listNotificationTemplates);
router.patch(
  "/notification-templates/:id",
  requireCapability(ADMIN_CAPABILITIES.MANAGE_NOTIFICATIONS),
  validate(updateNotificationTemplateSchema),
  ctrl.updateNotificationTemplate
);

router.get("/affiliates", requireCapability(ADMIN_CAPABILITIES.MANAGE_AFFILIATES), affiliateCtrl.list);
router.post("/affiliates", requireCapability(ADMIN_CAPABILITIES.MANAGE_AFFILIATES), validate(createAffiliateSchema), affiliateCtrl.create);
router.patch(
  "/affiliates/:id",
  requireCapability(ADMIN_CAPABILITIES.MANAGE_AFFILIATES),
  validate(updateAffiliateSchema),
  affiliateCtrl.update
);
router.patch(
  "/affiliates/:id/link",
  requireCapability(ADMIN_CAPABILITIES.MANAGE_AFFILIATES),
  validate(linkAffiliateSchema),
  affiliateCtrl.link
);
router.get("/affiliates/:id/commissions", requireCapability(ADMIN_CAPABILITIES.MANAGE_AFFILIATES), affiliateCtrl.commissions);

module.exports = router;
