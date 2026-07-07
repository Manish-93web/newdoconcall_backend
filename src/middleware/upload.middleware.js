const multer = require("multer");
const path = require("path");
const { v4: uuid } = require("uuid");

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads");

function storageFor(moduleName) {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(UPLOAD_ROOT, moduleName)),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${uuid()}${ext}`);
    },
  });
}

function uploadFor(moduleName, options = {}) {
  return multer({
    storage: storageFor(moduleName),
    limits: { fileSize: (options.maxSizeMb || 15) * 1024 * 1024 },
  });
}

module.exports = { uploadFor, UPLOAD_ROOT };
