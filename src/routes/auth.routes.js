const router = require("express").Router();
const { validate } = require("../middleware/validate.middleware");
const { authLimiter, otpLimiter } = require("../middleware/rateLimit.middleware");
const {
  registerSchema,
  otpRequestSchema,
  otpVerifySchema,
  loginSchema,
  refreshSchema,
  resetPasswordSchema,
  googleLoginSchema,
  appleLoginSchema,
} = require("../validators/auth.validators");
const ctrl = require("../controllers/auth.controller");

router.post("/register", authLimiter, validate(registerSchema), ctrl.register);
router.post("/otp/request", otpLimiter, validate(otpRequestSchema), ctrl.requestOtpHandler);
router.post("/otp/verify", authLimiter, validate(otpVerifySchema), ctrl.verifyOtpHandler);
router.post("/password/reset", otpLimiter, validate(resetPasswordSchema), ctrl.resetPasswordHandler);
router.post("/login", authLimiter, validate(loginSchema), ctrl.login);
router.post("/refresh-token", validate(refreshSchema), ctrl.refreshToken);
router.post("/logout", ctrl.logout);
router.post("/google", authLimiter, validate(googleLoginSchema), ctrl.googleLogin);
router.post("/apple", authLimiter, validate(appleLoginSchema), ctrl.appleLogin);

module.exports = router;
