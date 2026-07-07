const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { validate } = require("../middleware/validate.middleware");
const { createReviewSchema } = require("../validators/review.validators");
const ctrl = require("../controllers/reviews.controller");

router.get("/", ctrl.listForTarget);
router.post("/", authenticate(), validate(createReviewSchema), ctrl.create);

module.exports = router;
