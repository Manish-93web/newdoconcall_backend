const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const ctrl = require("../controllers/consultations.controller");

router.use(authenticate());

router.post("/:appointmentId/start", ctrl.start);
router.get("/ice-servers", ctrl.iceServers);
router.get("/invites/mine", ctrl.listMyInvites);
router.get("/:id", ctrl.getOne);
router.get("/:id/chat-history", ctrl.getChatHistory);
router.post("/:id/share-file", ctrl.shareFile);
router.post("/:id/end", ctrl.end);
router.post("/:id/invite", ctrl.invite);
router.patch("/:id/invite/accept", ctrl.acceptInvite);
router.patch("/:id/invite/decline", ctrl.declineInvite);

module.exports = router;
