const NotificationProvider = require("./interface");
const { createLogger } = require("../../utils/logger");

const log = createLogger("notification:console");

class ConsoleNotificationProvider extends NotificationProvider {
  async sendSms(to, message) {
    log.info(`SMS -> ${to}: ${message}`);
    return { delivered: true, provider: "console" };
  }

  async sendEmail(to, subject, body) {
    log.info(`EMAIL -> ${to} [${subject}]: ${body}`);
    return { delivered: true, provider: "console" };
  }

  async sendPush(fcmToken, title, body, data) {
    log.info(`PUSH -> ${fcmToken || "(no token)"} [${title}]: ${body}`, data);
    return { delivered: true, provider: "console" };
  }

  async sendWhatsapp(to, message) {
    log.info(`WHATSAPP -> ${to}: ${message}`);
    return { delivered: true, provider: "console" };
  }
}

module.exports = ConsoleNotificationProvider;
