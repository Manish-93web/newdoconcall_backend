const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const ctrl = require("../controllers/patientSubscriptions.controller");

router.use(authenticate());
router.get("/mine", ctrl.getMine);

module.exports = router;
