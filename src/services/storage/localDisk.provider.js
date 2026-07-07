const fs = require("fs");
const path = require("path");
const StorageProvider = require("./interface");
const { UPLOAD_ROOT } = require("../../middleware/upload.middleware");

class LocalDiskStorageProvider extends StorageProvider {
  async getStream(relativePath) {
    const fullPath = path.join(UPLOAD_ROOT, relativePath);
    if (!fullPath.startsWith(UPLOAD_ROOT)) throw new Error("Invalid file path");
    if (!fs.existsSync(fullPath)) throw new Error("File not found on disk");
    return fs.createReadStream(fullPath);
  }

  async delete(relativePath) {
    const fullPath = path.join(UPLOAD_ROOT, relativePath);
    if (!fullPath.startsWith(UPLOAD_ROOT)) throw new Error("Invalid file path");
    await fs.promises.unlink(fullPath).catch(() => {});
  }
}

module.exports = LocalDiskStorageProvider;
