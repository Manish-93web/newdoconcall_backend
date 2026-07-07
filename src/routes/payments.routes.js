const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { validate } = require("../middleware/validate.middleware");
const { createIntentSchema } = require("../validators/payment.validators");
const ctrl = require("../controllers/payments.controller");

// No authenticate() here — Stripe calls this directly with its own signature, not a bearer token.
router.post("/webhook", ctrl.webhook);

router.post("/create-intent", authenticate(), validate(createIntentSchema), ctrl.createIntent);
router.get("/:id", authenticate(), ctrl.getOne);

module.exports = router;
