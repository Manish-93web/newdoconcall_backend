const sgMail = require("@sendgrid/mail");
const NotificationProvider = require("./interface");
const env = require("../../config/env");
const { createLogger } = require("../../utils/logger");

const log = createLogger("notification:sendgrid");

class SendGridNotificationProvider extends NotificationProvider {
  constructor() {
    super();
    sgMail.setApiKey(env.sendgrid.apiKey);
  }

  async sendEmail(to, subject, body) {
    await sgMail.send({ to, from: env.sendgrid.fromEmail, subject, text: body });
    log.info(`EMAIL -> ${to} [${subject}]`);
    return { delivered: true, provider: "sendgrid" };
  }
}

module.exports = SendGridNotificationProvider;
