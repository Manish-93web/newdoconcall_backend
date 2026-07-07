const mongoose = require("mongoose");

const familyMemberSchema = new mongoose.Schema(
  {
    primaryUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    relation: {
      type: String,
      enum: ["self", "spouse", "child", "parent", "other"],
      required: true,
    },
    dob: Date,
    gender: { type: String, enum: ["male", "female", "other"] },
    healthSummary: {
      bloodGroup: String,
      allergies: [String],
      chronicConditions: [String],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FamilyMember", familyMemberSchema);
