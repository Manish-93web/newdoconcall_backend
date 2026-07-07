const router = require("express").Router();

router.get("/health", (req, res) => res.json({ success: true, data: { status: "ok", time: new Date().toISOString() } }));

router.use("/auth", require("./auth.routes"));
router.use("/users", require("./users.routes"));
router.use("/family-members", require("./familyMembers.routes"));
router.use("/", require("./files.routes"));
router.use("/specializations", require("./specializations.routes"));
router.use("/doctors", require("./doctors.routes"));
router.use("/clinics", require("./clinics.routes"));
router.use("/appointments", require("./appointments.routes"));
router.use("/consultations", require("./consultations.routes"));
router.use("/prescriptions", require("./prescriptions.routes"));
router.use("/health-records", require("./healthRecords.routes"));
router.use("/medicines", require("./medicines.routes"));
router.use("/pharmacy-orders", require("./pharmacyOrders.routes"));
router.use("/diagnostics", require("./diagnostics.routes"));
router.use("/diagnostic-bookings", require("./diagnosticBookings.routes"));
router.use("/payments", require("./payments.routes"));
router.use("/payouts", require("./payouts.routes"));
router.use("/articles", require("./articles.routes"));
router.use("/complaints", require("./complaints.routes"));
router.use("/ai", require("./ai.routes"));
router.use("/admin", require("./admin.routes"));
router.use("/reviews", require("./reviews.routes"));
router.use("/notifications", require("./notifications.routes"));

module.exports = router;
