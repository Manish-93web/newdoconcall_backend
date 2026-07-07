const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const ctrl = require("../controllers/ai.controller");

router.post("/symptom-check", authenticate({ optional: true }), ctrl.symptomCheck);
router.post("/doctor-recommendation", authenticate({ optional: true }), ctrl.doctorRecommendation);
router.get("/risk-prediction", authenticate(), ctrl.riskPrediction);

module.exports = router;
