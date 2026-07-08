const admin = require("firebase-admin");
const NotificationProvider = require("./interface");
const env = require("../../config/env");
const { createLogger } = require("../../utils/logger");

const log = createLogger("notification:fcm");

class FcmNotificationProvider extends NotificationProvider {
  constructor() {
    super();
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(env.firebase.serviceAccountJson);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
  }

  async sendPush(fcmToken, title, body, data) {
    if (!fcmToken) return { delivered: false, provider: "fcm", reason: "no token" };
    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: data ? stringifyValues(data) : undefined,
    });
    log.info(`PUSH -> ${fcmToken} [${title}]`);
    return { delivered: true, provider: "fcm" };
  }
}

// FCM's `data` payload requires every value to be a string.
function stringifyValues(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v)]));
}

module.exports = FcmNotificationProvider;
