const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const ctrl = require("../controllers/notifications.controller");

router.use(authenticate());
router.get("/", ctrl.list);
router.get("/unread-count", ctrl.unreadCount);
router.patch("/:id/read", ctrl.markRead);
router.patch("/:id/unread", ctrl.markUnread);

module.exports = router;
