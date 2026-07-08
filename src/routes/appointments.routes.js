const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { validate } = require("../middleware/validate.middleware");
const {
  bookAppointmentSchema,
  rescheduleSchema,
  cancelSchema,
  rejectSchema,
  bookInstantSchema,
} = require("../validators/appointment.validators");
const ctrl = require("../controllers/appointments.controller");

router.use(authenticate());

router.post("/", validate(bookAppointmentSchema), ctrl.book);
router.post("/instant", validate(bookInstantSchema), ctrl.bookInstant);
router.get("/", ctrl.list);
router.get("/:id", ctrl.getOne);
router.patch("/:id/reschedule", validate(rescheduleSchema), ctrl.reschedule);
router.patch("/:id/cancel", validate(cancelSchema), ctrl.cancel);
router.patch("/:id/accept", ctrl.accept);
router.patch("/:id/reject", validate(rejectSchema), ctrl.reject);
router.patch("/:id/complete", ctrl.complete);

module.exports = router;
