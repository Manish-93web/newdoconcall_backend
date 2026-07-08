const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/rbac.middleware");
const { validate } = require("../middleware/validate.middleware");
const { ROLES } = require("../config/constants");
const { createSubscriptionPlanSchema, updateSubscriptionPlanSchema } = require("../validators/subscriptionPlan.validators");
const ctrl = require("../controllers/subscriptionPlans.controller");

const adminOnly = allowRoles(ROLES.PLATFORM_ADMIN);

router.get("/", ctrl.list);
router.post("/", authenticate(), adminOnly, validate(createSubscriptionPlanSchema), ctrl.create);
router.patch("/:id", authenticate(), adminOnly, validate(updateSubscriptionPlanSchema), ctrl.update);
router.delete("/:id", authenticate(), adminOnly, ctrl.remove);

module.exports = router;
