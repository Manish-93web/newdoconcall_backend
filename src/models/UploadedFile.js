const mongoose = require("mongoose");

const uploadedFileSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    module: {
      type: String,
      enum: ["prescription", "report", "kyc", "profileImage", "signature"],
      required: true,
    },
    storageProvider: { type: String, enum: ["local", "s3"], default: "local" },
    path: { type: String, required: true }, // relative path or S3 key
    originalName: String,
    mimetype: String,
    size: Number,
  },
  { timestamps: true }
);

module.exports = mongoose.model("UploadedFile", uploadedFileSchema);
