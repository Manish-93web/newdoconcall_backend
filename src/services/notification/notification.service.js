const CompositeNotificationProvider = require("./composite.provider");
const Notification = require("../../models/Notification");
const User = require("../../models/User");
const env = require("../../config/env");
const { NOTIFICATION_CHANNELS } = require("../../config/constants");
const { createLogger } = require("../../utils/logger");

const log = createLogger("notification:service");

// CompositeNotificationProvider activates each real channel (Twilio/SendGrid/FCM)
// independently the moment that channel's own credentials are configured in .env, and
// transparently falls back to logging to the console per-channel otherwise — so with no
// keys set at all (today's state) this is behaviorally identical to console-only.
function resolveProvider() {
  return new CompositeNotificationProvider();
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
    } else if (channel === NOTIFICATION_CHANNELS.WHATSAPP && user.phone) {
      await provider.sendWhatsapp(user.phone, `${title}: ${body}`);
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
  if (isEmail) {
    const message = `Your DoconCall ${purpose} OTP is ${otpCode}. Valid for 10 minutes.`;
    await provider.sendEmail(identifier, "Your DoconCall OTP", message);
  } else {
    // The Android SMS Retriever API (react-native-otp-verify on the mobile app) requires
    // the message to start with "<#>" and end with the app's signed hash on its own —
    // no other format works for auto-read. Falls back to a plain message if unconfigured.
    const message = env.smsAppHash
      ? `<#> Your DoconCall ${purpose} OTP is ${otpCode}. Valid for 10 minutes.\n${env.smsAppHash}`
      : `Your DoconCall ${purpose} OTP is ${otpCode}. Valid for 10 minutes.`;
    await provider.sendSms(identifier, message);
  }
}

module.exports = { notify, sendOtp };
