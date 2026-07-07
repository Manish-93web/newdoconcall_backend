const router = require("express").Router();
const ctrl = require("../controllers/medicines.controller");

router.get("/", ctrl.search);
router.get("/:id", ctrl.getOne);
router.get("/:id/alternatives", ctrl.getAlternatives);

module.exports = router;
