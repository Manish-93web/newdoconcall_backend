const cron = require("node-cron");
const PharmacyOrder = require("../models/PharmacyOrder");
const { notify } = require("../services/notification/notification.service");
const { NOTIFICATION_CHANNELS } = require("../config/constants");
const { createLogger } = require("../utils/logger");

const log = createLogger("jobs:refillReminders");

function startRefillReminderJob() {
  cron.schedule("0 * * * *", async () => {
    try {
      const due = await PharmacyOrder.find({
        "refillReminder.enabled": true,
        "refillReminder.nextReminderAt": { $lte: new Date() },
      });

      for (const order of due) {
        await notify({
          userId: order.patient,
          channel: NOTIFICATION_CHANNELS.PUSH,
          type: "medicine_refill_reminder",
          title: "Time to refill your medicines",
          body: "Based on your last order, it's time to reorder your medicines.",
          data: { orderId: order._id },
        });

        order.refillReminder.nextReminderAt = new Date(
          Date.now() + order.refillReminder.intervalDays * 86400000
        );
        await order.save();
      }

      if (due.length) log.info(`Sent ${due.length} refill reminder(s)`);
    } catch (err) {
      log.error("Refill reminder job failed", err.message);
    }
  });
  log.info("Refill reminder job scheduled (hourly)");
}

module.exports = { startRefillReminderJob };
