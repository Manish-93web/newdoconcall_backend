const env = require("../../config/env");
const LocalDiskStorageProvider = require("./localDisk.provider");

function resolveProvider() {
  switch (env.uploadStorageProvider) {
    case "local":
    default:
      return new LocalDiskStorageProvider();
  }
}

module.exports = resolveProvider();
