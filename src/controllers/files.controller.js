const path = require("path");
const UploadedFile = require("../models/UploadedFile");
const HealthRecord = require("../models/HealthRecord");
const storage = require("../services/storage/storage.service");
const { created, ApiError } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const upload = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, "FILE_REQUIRED", "No file uploaded");
  const moduleName = req.params.module;

  const record = await UploadedFile.create({
    owner: req.user.id,
    module: moduleName,
    storageProvider: "local",
    path: path.join(moduleName, req.file.filename),
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
  });

  return created(res, record, "File uploaded");
});

async function assertAccess(file, user) {
  if (file.owner.toString() === user.id) return true;

  const grant = await HealthRecord.findOne({
    fileRef: file._id,
    accessGrants: {
      $elemMatch: { grantedTo: user.id, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
    },
  });
  if (grant) return true;

  if (user.role === "platform_admin") return true;

  throw new ApiError(403, "FORBIDDEN", "You do not have access to this file");
}

const stream = asyncHandler(async (req, res) => {
  const file = await UploadedFile.findById(req.params.fileId);
  if (!file) throw new ApiError(404, "NOT_FOUND", "File not found");

  await assertAccess(file, req.user);

  const readStream = await storage.getStream(file.path);
  res.setHeader("Content-Type", file.mimetype || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${file.originalName || "file"}"`);
  readStream.pipe(res);
});

module.exports = { upload, stream };
