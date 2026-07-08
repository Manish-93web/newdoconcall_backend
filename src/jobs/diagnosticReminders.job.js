const cron = require("node-cron");
const DiagnosticBooking = require("../models/DiagnosticBooking");
const { notify } = require("../services/notification/notification.service");
const { NOTIFICATION_CHANNELS } = require("../config/constants");
const { createLogger } = require("../utils/logger");

const log = createLogger("jobs:diagnosticReminders");

async function sendRemindersWithinWindow(minutesFromNow, windowMinutes, reminderKey) {
  const windowStart = new Date(Date.now() + minutesFromNow * 60000);
  const windowEnd = new Date(windowStart.getTime() + windowMinutes * 60000);

  const bookings = await DiagnosticBooking.find({
    status: "booked",
    scheduledSlot: { $gte: windowStart, $lt: windowEnd },
  }).populate("lab", "name");

  for (const booking of bookings) {
    const when = booking.scheduledSlot.toLocaleString();
    const collectionNote = booking.collectionType === "home" ? "Sample collection at your address" : "Visit the lab";
    await notify({
      userId: booking.patient,
      channel: NOTIFICATION_CHANNELS.PUSH,
      type: `diagnostic_reminder_${reminderKey}`,
      title: "Upcoming diagnostic test",
      body: `${collectionNote} for your test(s) at ${booking.lab?.name || "the lab"} is scheduled for ${when}`,
      data: { bookingId: booking._id },
    });
  }

  if (bookings.length) {
    log.info(`Sent ${reminderKey} reminders for ${bookings.length} diagnostic booking(s)`);
  }
}

function startDiagnosticReminderJob() {
  // Runs every 15 minutes; a 24h-out reminder covers fasting/prep instructions timing,
  // a 2h-out reminder covers same-day "get ready" nudges — same windowed-match pattern
  // as appointmentReminders.job.js so no booking is double- or un-reminded.
  cron.schedule("*/15 * * * *", async () => {
    try {
      await sendRemindersWithinWindow(24 * 60, 15, "24h");
      await sendRemindersWithinWindow(120, 15, "2h");
    } catch (err) {
      log.error("Diagnostic reminder job failed", err.message);
    }
  });
  log.info("Diagnostic reminder job scheduled (every 15 minutes)");
}

module.exports = { startDiagnosticReminderJob };
