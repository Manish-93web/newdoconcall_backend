const PlatformSetting = require("../../models/PlatformSetting");

const PERCENT_KEY_BY_PURPOSE = {
  appointment: "consultationCommissionPercent",
  pharmacy_order: "pharmacyCommissionPercent",
  diagnostic_booking: "diagnosticMarginPercent",
};

/**
 * Computes the platform commission and net-to-provider split for a gross amount.
 * Always derives the percent server-side from PlatformSetting — callers must never
 * pass a client-supplied commission figure.
 */
async function computeSplit(purpose, grossAmount) {
  const settings = await PlatformSetting.getSettings();
  const percentKey = PERCENT_KEY_BY_PURPOSE[purpose];
  const percent = percentKey ? settings[percentKey] || 0 : 0;

  const commissionAmount = Math.round(((grossAmount * percent) / 100) * 100) / 100;
  const netToProvider = Math.round((grossAmount - commissionAmount) * 100) / 100;

  return { commissionAmount, netToProvider, percentApplied: percent };
}

module.exports = { computeSplit };
