const FamilyMember = require("../../models/FamilyMember");
const User = require("../../models/User");

function ageFromDob(dob) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

/**
 * Trivial rule-based health risk heuristic (age + chronic condition tags) — placeholder
 * for a real predictive model once historical outcome data exists to train one.
 */
async function predictRisk({ userId, forFamilyMemberId }) {
  let age = null;
  let chronicConditions = [];

  if (forFamilyMemberId) {
    const member = await FamilyMember.findById(forFamilyMemberId);
    if (!member) return { risk: "unknown", reasons: ["Profile not found"] };
    age = ageFromDob(member.dob);
    chronicConditions = member.healthSummary?.chronicConditions || [];
  } else {
    const user = await User.findById(userId);
    age = ageFromDob(user?.dob);
  }

  const reasons = [];
  let score = 0;

  if (age !== null && age >= 60) {
    score += 2;
    reasons.push("Age 60 or above");
  } else if (age !== null && age >= 40) {
    score += 1;
    reasons.push("Age 40 or above");
  }

  if (chronicConditions.length) {
    score += chronicConditions.length;
    reasons.push(`Chronic condition(s): ${chronicConditions.join(", ")}`);
  }

  const risk = score >= 3 ? "high" : score >= 1 ? "medium" : "low";
  return { risk, reasons };
}

module.exports = { predictRisk };
