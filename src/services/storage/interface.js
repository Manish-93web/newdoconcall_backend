// Swap-in contract for a future S3StorageProvider (selected via UPLOAD_STORAGE_PROVIDER).
class StorageProvider {
  async getStream(_relativePath) {
    throw new Error("getStream not implemented");
  }

  async delete(_relativePath) {
    throw new Error("delete not implemented");
  }
}

module.exports = StorageProvider;
