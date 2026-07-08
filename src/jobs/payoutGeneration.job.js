const cron = require("node-cron");
const { generatePayoutsForPeriod } = require("../services/payout.service");
const { createLogger } = require("../utils/logger");

const log = createLogger("jobs:payoutGeneration");

function startPayoutGenerationJob() {
  // Runs at 2am on the 1st of each month, generating payouts for the previous full
  // calendar month. Admin-triggered generation via POST /payouts/generate stays available
  // for on-demand/custom-range use — this doesn't replace it.
  cron.schedule("0 2 1 * *", async () => {
    try {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth(), 1);
      const payouts = await generatePayoutsForPeriod(periodStart, periodEnd);
      log.info(`Generated ${payouts.length} payout(s) for ${periodStart.toISOString()} - ${periodEnd.toISOString()}`);
    } catch (err) {
      log.error("Payout generation job failed", err.message);
    }
  });
  log.info("Payout generation job scheduled (monthly, 2am on the 1st)");
}

module.exports = { startPayoutGenerationJob };
