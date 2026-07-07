const env = require("../../config/env");
const ConsoleNotificationProvider = require("./console.provider");
const Notification = require("../../models/Notification");
const User = require("../../models/User");
const { NOTIFICATION_CHANNELS } = require("../../config/constants");
const { createLogger } = require("../../utils/logger");

const log = createLogger("notification:service");

function resolveProvider() {
  // NOTIFICATION_PROVIDER env selects the implementation; only "console" exists until
  // real SMS/email/push credentials are configured (see .env.example).
  switch (env.notificationProvider) {
    case "console":
    default:
      return new ConsoleNotificationProvider();
  }
}

const provider = resolveProvider();

/**
 * Single call site the rest of the app uses to notify a user. Persists a Notification
 * document regardless of provider outcome, then attempts delivery over the requested channel.
 */
async function notify({ userId, channel, type, title, body, data }) {
  const notification = await Notification.create({
    recipient: userId,
    channel,
    type,
    title,
    body,
    data,
    status: "queued",
  });

  try {
    const user = await User.findById(userId).select("email phone fcmTokens");
    if (!user) throw new Error("Recipient not found");

    if (channel === NOTIFICATION_CHANNELS.SMS && user.phone) {
      await provider.sendSms(user.phone, `${title}: ${body}`);
    } else if (channel === NOTIFICATION_CHANNELS.EMAIL && user.email) {
      await provider.sendEmail(user.email, title, body);
    } else if (channel === NOTIFICATION_CHANNELS.PUSH) {
      for (const token of user.fcmTokens || []) {
        await provider.sendPush(token, title, body, data);
      }
    }

    notification.status = "sent";
    await notification.save();
  } catch (err) {
    log.error("Failed to dispatch notification", err.message);
    notification.status = "failed";
    await notification.save();
  }

  return notification;
}

async function sendOtp(identifier, otpCode, purpose) {
  const isEmail = identifier.includes("@");
  const message = `Your DoconCall ${purpose} OTP is ${otpCode}. Valid for 10 minutes.`;
  if (isEmail) {
    await provider.sendEmail(identifier, "Your DoconCall OTP", message);
  } else {
    await provider.sendSms(identifier, message);
  }
}

module.exports = { notify, sendOtp };
