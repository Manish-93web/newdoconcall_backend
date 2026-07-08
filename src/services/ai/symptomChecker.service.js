const Anthropic = require("@anthropic-ai/sdk");
const symptomMap = require("../../seed/symptomSpecializationMap.json");
const env = require("../../config/env");
const { createLogger } = require("../../utils/logger");

const log = createLogger("ai:symptom-checker");

const URGENCY_RANK = { low: 0, medium: 1, high: 2 };

/**
 * Deterministic keyword-matching symptom checker. Used as-is when no
 * ANTHROPIC_API_KEY is configured, and as a safety-net fallback if the Claude
 * call fails for any reason (network error, refusal, malformed response).
 */
function checkSymptomsHeuristic(symptomsText) {
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

const SYSTEM_PROMPT =
  "You are a medical triage assistant for the DoconCall telehealth platform. Given a " +
  "patient's free-text description of their symptoms, identify possible (non-diagnostic) " +
  "conditions, recommend which doctor specializations they should book, and assess " +
  "urgency. You are not diagnosing — you are helping route the patient to the right kind " +
  "of care. If symptoms could indicate a medical emergency (e.g. chest pain, difficulty " +
  "breathing, stroke signs, severe bleeding, suicidal ideation), set urgency to \"high\" " +
  "and say so plainly in the note, including that the patient should seek emergency care " +
  "immediately rather than wait for a telehealth appointment.";

const SYMPTOM_CHECK_SCHEMA = {
  type: "object",
  properties: {
    possibleConditions: { type: "array", items: { type: "string" } },
    recommendedSpecializations: { type: "array", items: { type: "string" } },
    urgency: { type: "string", enum: ["low", "medium", "high"] },
    note: { type: "string" },
  },
  required: ["possibleConditions", "recommendedSpecializations", "urgency", "note"],
  additionalProperties: false,
};

let anthropicClient = null;
function getAnthropicClient() {
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: env.anthropicApiKey });
  return anthropicClient;
}

async function checkSymptomsWithClaude(symptomsText) {
  const response = await getAnthropicClient().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: SYMPTOM_CHECK_SCHEMA } },
    messages: [{ role: "user", content: symptomsText }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined to process this symptom description");
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock) throw new Error("Claude response had no text content");
  return JSON.parse(textBlock.text);
}

async function checkSymptoms(symptomsText) {
  if (!env.anthropicApiKey) return checkSymptomsHeuristic(symptomsText);

  try {
    return await checkSymptomsWithClaude(symptomsText);
  } catch (err) {
    log.error("Claude symptom check failed, falling back to heuristic", err.message);
    return checkSymptomsHeuristic(symptomsText);
  }
}

module.exports = { checkSymptoms };
