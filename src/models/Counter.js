const mongoose = require("mongoose");

// Generic atomic sequence counter (e.g. _id "healthId:2026") — findOneAndUpdate with
// $inc + upsert is atomic in MongoDB, so concurrent requests never hand out the same seq.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model("Counter", counterSchema);
