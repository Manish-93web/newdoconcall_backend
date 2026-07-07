const symptomMap = require("../../seed/symptomSpecializationMap.json");

const URGENCY_RANK = { low: 0, medium: 1, high: 2 };

/**
 * Deterministic keyword-matching symptom checker. Not a real diagnostic AI — flagged
 * as a placeholder with a stable input/output contract, swappable for a real LLM/ML
 * model later without touching call sites.
 */
function checkSymptoms(symptomsText) {
  const text = symptomsText.toLowerCase();
  const matched = Object.entries(symptomMap).filter(([keyword]) => text.includes(keyword));

  if (!matched.length) {
    return {
      possibleConditions: [],
      recommendedSpecializations: ["General Physician"],
      urgency: "low",
      note: "No specific symptoms recognized — defaulting to a General Physician consultation.",
    };
  }

  const conditions = new Set();
  const specializations = new Set();
  let urgency = "low";

  for (const [, info] of matched) {
    info.conditions.forEach((c) => conditions.add(c));
    info.specializations.forEach((s) => specializations.add(s));
    if (URGENCY_RANK[info.urgency] > URGENCY_RANK[urgency]) urgency = info.urgency;
  }

  return {
    possibleConditions: [...conditions],
    recommendedSpecializations: [...specializations],
    urgency,
  };
}

module.exports = { checkSymptoms };
