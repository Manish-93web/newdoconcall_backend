const cron = require("node-cron");
const Appointment = require("../models/Appointment");
const DoctorProfile = require("../models/DoctorProfile");
const { notify } = require("../services/notification/notification.service");
const { NOTIFICATION_CHANNELS, APPOINTMENT_STATUSES } = require("../config/constants");
const { createLogger } = require("../utils/logger");

const log = createLogger("jobs:appointmentReminders");

async function sendRemindersWithinWindow(minutesFromNow, windowMinutes, reminderKey) {
  const windowStart = new Date(Date.now() + minutesFromNow * 60000);
  const windowEnd = new Date(windowStart.getTime() + windowMinutes * 60000);

  const appointments = await Appointment.find({
    status: APPOINTMENT_STATUSES.CONFIRMED,
    scheduledStart: { $gte: windowStart, $lt: windowEnd },
  }).populate({ path: "doctor", populate: { path: "user", select: "name" } });

  for (const appointment of appointments) {
    const when = appointment.scheduledStart.toLocaleString();
    await notify({
      userId: appointment.patient,
      channel: NOTIFICATION_CHANNELS.PUSH,
      type: `appointment_reminder_${reminderKey}`,
      title: "Upcoming appointment",
      body: `Your appointment with Dr. ${appointment.doctor?.user?.name || ""} is at ${when}`,
      data: { appointmentId: appointment._id },
    });
  }

  if (appointments.length) {
    log.info(`Sent ${reminderKey} reminders for ${appointments.length} appointment(s)`);
  }
}

function startAppointmentReminderJob() {
  // Runs every 5 minutes; each run checks a window matching its own cadence so no
  // appointment gets double-reminded and none slip through between runs.
  cron.schedule("*/5 * * * *", async () => {
    try {
      await sendRemindersWithinWindow(24 * 60, 5, "24h");
      await sendRemindersWithinWindow(60, 5, "1h");
    } catch (err) {
      log.error("Reminder job failed", err.message);
    }
  });
  log.info("Appointment reminder job scheduled (every 5 minutes)");
}

module.exports = { startAppointmentReminderJob };
