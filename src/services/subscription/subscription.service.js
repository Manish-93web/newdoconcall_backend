const Counter = require("../../models/Counter");
const SubscriptionPlan = require("../../models/SubscriptionPlan");
const PatientSubscription = require("../../models/PatientSubscription");
const User = require("../../models/User");

async function generateHealthId() {
  const year = new Date().getFullYear();
  const counter = await Counter.findOneAndUpdate(
    { _id: `healthId:${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return `DOC-${year}-${String(counter.seq).padStart(4, "0")}`;
}

// Called right after a patient registers so "1st consultation is free" and the Health ID
// dashboard both work with zero purchase flow required. Idempotent — safe to call more
// than once for the same user (e.g. re-triggered by a retried request).
async function provisionFreemiumSubscription(userId) {
  const existing = await PatientSubscription.findOne({ user: userId });
  if (existing) return existing;

  const freemiumPlan = await SubscriptionPlan.findOne({ isFreemium: true, isActive: true });
  if (!freemiumPlan) return null;

  const subscription = await PatientSubscription.create({
    user: userId,
    plan: freemiumPlan._id,
    sessionsRemaining: freemiumPlan.sessionsIncluded,
    status: "active",
  });

  const user = await User.findById(userId).select("healthId");
  if (user && !user.healthId) {
    user.healthId = await generateHealthId();
    await user.save();
  }

  return subscription;
}

module.exports = { generateHealthId, provisionFreemiumSubscription };
