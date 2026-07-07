const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const ctrl = require("../controllers/notifications.controller");

router.use(authenticate());
router.get("/", ctrl.list);
router.patch("/:id/read", ctrl.markRead);

module.exports = router;
