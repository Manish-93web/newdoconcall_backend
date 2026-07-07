const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const ctrl = require("../controllers/users.controller");

router.use(authenticate());
router.get("/me", ctrl.getMe);
router.patch("/me", ctrl.updateMe);
router.post("/me/fcm-token", ctrl.registerFcmToken);

module.exports = router;
