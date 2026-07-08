const NotificationProvider = require("./interface");
const ConsoleNotificationProvider = require("./console.provider");
const env = require("../../config/env");
const { createLogger } = require("../../utils/logger");

const log = createLogger("notification:composite");

// Each channel independently uses its real provider once that channel's credentials are
// configured, and falls back to the console provider otherwise — so SMS can go live via
// Twilio while email/push are still pending SendGrid/Firebase credentials, with no code
// changes required as each set of keys is added.
class CompositeNotificationProvider extends NotificationProvider {
  constructor() {
    super();
    this.consoleFallback = new ConsoleNotificationProvider();
    this.sms = tryBuild("twilio", env.twilio.accountSid && env.twilio.authToken && env.twilio.fromNumber, () =>
      new (require("./twilio.provider"))()
    );
    this.email = tryBuild("sendgrid", env.sendgrid.apiKey && env.sendgrid.fromEmail, () =>
      new (require("./sendgrid.provider"))()
    );
    this.push = tryBuild("fcm", env.firebase.serviceAccountJson, () => new (require("./fcm.provider"))());
  }

  async sendSms(to, message) {
    return this.sms ? this.sms.sendSms(to, message) : this.consoleFallback.sendSms(to, message);
  }

  async sendEmail(to, subject, body) {
    return this.email ? this.email.sendEmail(to, subject, body) : this.consoleFallback.sendEmail(to, subject, body);
  }

  async sendPush(fcmToken, title, body, data) {
    return this.push
      ? this.push.sendPush(fcmToken, title, body, data)
      : this.consoleFallback.sendPush(fcmToken, title, body, data);
  }
}

function tryBuild(name, configured, factory) {
  if (!configured) return null;
  try {
    return factory();
  } catch (err) {
    log.error(`Failed to initialize ${name} provider, falling back to console for this channel`, err.message);
    return null;
  }
}

module.exports = CompositeNotificationProvider;
