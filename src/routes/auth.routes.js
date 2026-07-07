const router = require("express").Router();
const { validate } = require("../middleware/validate.middleware");
const {
  registerSchema,
  otpRequestSchema,
  otpVerifySchema,
  loginSchema,
  refreshSchema,
} = require("../validators/auth.validators");
const ctrl = require("../controllers/auth.controller");

router.post("/register", validate(registerSchema), ctrl.register);
router.post("/otp/request", validate(otpRequestSchema), ctrl.requestOtpHandler);
router.post("/otp/verify", validate(otpVerifySchema), ctrl.verifyOtpHandler);
router.post("/login", validate(loginSchema), ctrl.login);
router.post("/refresh-token", validate(refreshSchema), ctrl.refreshToken);
router.post("/logout", ctrl.logout);
router.get("/google", ctrl.googleAuthStub);
router.get("/google/callback", ctrl.googleAuthStub);

module.exports = router;
