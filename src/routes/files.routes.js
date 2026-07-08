const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const { uploadFor } = require("../middleware/upload.middleware");
const { ApiError } = require("../utils/apiResponse");
const ctrl = require("../controllers/files.controller");

// Must match UploadedFile's `module` enum exactly — also doubles as the on-disk
// folder name under uploads/, so an unlisted value here would 500 on ENOENT anyway.
const ALLOWED_MODULES = ["prescription", "report", "kyc", "profileImage", "signature"];

// authenticate() is applied per-route (not via router.use) because this router is
// mounted at "/" alongside other route groups — a blanket router.use(authenticate())
// here would 401 every request that reaches this router, including public routes
// registered after it in routes/index.js, since next(err) skips their sibling .use() calls.
router.post(
  "/uploads/:module",
  authenticate(),
  (req, res, next) => {
    if (!ALLOWED_MODULES.includes(req.params.module)) {
      return next(new ApiError(400, "INVALID_MODULE", `module must be one of: ${ALLOWED_MODULES.join(", ")}`));
    }
    uploadFor(req.params.module).single("file")(req, res, next);
  },
  ctrl.upload
);
router.get("/files/:fileId", authenticate(), ctrl.stream);

module.exports = router;
