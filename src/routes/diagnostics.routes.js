const router = require("express").Router();
const ctrl = require("../controllers/diagnostics.controller");

router.get("/tests", ctrl.listTests);
router.get("/labs", ctrl.searchLabs);
router.get("/labs/:id", ctrl.getLab);

module.exports = router;
