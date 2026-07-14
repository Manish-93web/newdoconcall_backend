require("dotenv").config();

const required = ["MONGODB_URI", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 5000,
  mongodbUri: process.env.MONGODB_URI,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "30m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  },
  googleMapsServerKey: process.env.GOOGLE_MAPS_SERVER_KEY || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  googleOAuth: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  },
  webrtc: {
    stunUrls: (process.env.STUN_URLS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    turn: {
      urls: (process.env.TURN_URLS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      staticSecret: process.env.TURN_STATIC_SECRET || "",
    },
  },
  notificationProvider: process.env.NOTIFICATION_PROVIDER || "console",
  // Android SMS Retriever API app hash — appended to outgoing OTP SMS bodies so the
  // mobile app can auto-read the code. Blank = simply omitted, manual entry still works.
  smsAppHash: process.env.SMS_APP_HASH || "",
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    fromNumber: process.env.TWILIO_FROM_NUMBER || "",
    // WhatsApp Business API sender — a *different* number from fromNumber above (must be
    // WhatsApp-enabled in the Twilio console, e.g. the sandbox number while testing).
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || "",
  },
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY || "",
    fromEmail: process.env.SENDGRID_FROM_EMAIL || "",
  },
  firebase: {
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "",
  },
  uploadStorageProvider: process.env.UPLOAD_STORAGE_PROVIDER || "local",
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  socketCorsOrigins: (process.env.SOCKET_CORS_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  apiBaseUrl: process.env.API_BASE_URL || "http://localhost:5000",
};
