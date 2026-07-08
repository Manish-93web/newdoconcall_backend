const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/rbac.middleware");
const { validate } = require("../middleware/validate.middleware");
const { ROLES } = require("../config/constants");
const { createInvoiceSchema } = require("../validators/invoice.validators");
const ctrl = require("../controllers/invoices.controller");

const clinicRoles = allowRoles(ROLES.CLINIC_ADMIN, ROLES.CLINIC_STAFF, ROLES.PLATFORM_ADMIN);

router.use(authenticate());

router.get("/mine", ctrl.listMine);
router.get("/:id", ctrl.getOne);
router.patch("/:id/mark-paid", clinicRoles, ctrl.markPaid);

module.exports = router;
