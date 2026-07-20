const twilio = require("twilio");
const NotificationProvider = require("./interface");
const env = require("../../config/env");
const { createLogger } = require("../../utils/logger");

const log = createLogger("notification:whatsapp");

// Twilio's WhatsApp Business API reuses the same REST client as SMS — sender and
// recipient just need a "whatsapp:" prefix. A separate, WhatsApp-enabled sender number
// (env.twilio.whatsappFrom) is required — it is NOT the same number as plain SMS.
class WhatsappNotificationProvider extends NotificationProvider {
  constructor() {
    super();
    this.client = twilio(env.twilio.accountSid, env.twilio.authToken);
  }

  async sendWhatsapp(to, message, mediaUrl) {
    const result = await this.client.messages.create({
      to: `whatsapp:${to}`,
      from: `whatsapp:${env.twilio.whatsappFrom}`,
      body: message,
      ...(mediaUrl ? { mediaUrl: [mediaUrl] } : {}),
    });
    log.info(`WHATSAPP -> ${to} (sid ${result.sid})${mediaUrl ? " with media" : ""}`);
    return { delivered: true, provider: "twilio-whatsapp", sid: result.sid };
  }
}

module.exports = WhatsappNotificationProvider;
