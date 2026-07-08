const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const ctrl = require("../controllers/healthRecords.controller");

router.use(authenticate());
router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.get("/patient/:patientId", ctrl.listForPatient);
router.get("/:id", ctrl.getOne);
router.delete("/:id", ctrl.remove);
router.post("/:id/share", ctrl.share);

module.exports = router;
