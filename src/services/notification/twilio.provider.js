const twilio = require("twilio");
const NotificationProvider = require("./interface");
const env = require("../../config/env");
const { createLogger } = require("../../utils/logger");

const log = createLogger("notification:twilio");

class TwilioNotificationProvider extends NotificationProvider {
  constructor() {
    super();
    this.client = twilio(env.twilio.accountSid, env.twilio.authToken);
  }

  async sendSms(to, message) {
    const result = await this.client.messages.create({ to, from: env.twilio.fromNumber, body: message });
    log.info(`SMS -> ${to} (sid ${result.sid})`);
    return { delivered: true, provider: "twilio", sid: result.sid };
  }
}

module.exports = TwilioNotificationProvider;
