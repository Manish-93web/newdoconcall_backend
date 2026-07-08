// Swap-in contract for real providers (Twilio/MSG91 for SMS, SendGrid/SMTP for email, FCM for push).
class NotificationProvider {
  async sendSms(_to, _message) {
    throw new Error("sendSms not implemented");
  }

  async sendEmail(_to, _subject, _body) {
    throw new Error("sendEmail not implemented");
  }

  async sendPush(_fcmToken, _title, _body, _data) {
    throw new Error("sendPush not implemented");
  }

  async sendWhatsapp(_to, _message) {
    throw new Error("sendWhatsapp not implemented");
  }
}

module.exports = NotificationProvider;
