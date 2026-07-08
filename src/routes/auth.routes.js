const router = require("express").Router();
const { validate } = require("../middleware/validate.middleware");
const {
  registerSchema,
  otpRequestSchema,
  otpVerifySchema,
  loginSchema,
  refreshSchema,
  resetPasswordSchema,
  googleLoginSchema,
} = require("../validators/auth.validators");
const ctrl = require("../controllers/auth.controller");

router.post("/register", validate(registerSchema), ctrl.register);
router.post("/otp/request", validate(otpRequestSchema), ctrl.requestOtpHandler);
router.post("/otp/verify", validate(otpVerifySchema), ctrl.verifyOtpHandler);
router.post("/password/reset", validate(resetPasswordSchema), ctrl.resetPasswordHandler);
router.post("/login", validate(loginSchema), ctrl.login);
router.post("/refresh-token", validate(refreshSchema), ctrl.refreshToken);
router.post("/logout", ctrl.logout);
router.post("/google", validate(googleLoginSchema), ctrl.googleLogin);

module.exports = router;
