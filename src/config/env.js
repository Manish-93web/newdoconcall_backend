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
  googleOAuth: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  },
  notificationProvider: process.env.NOTIFICATION_PROVIDER || "console",
  uploadStorageProvider: process.env.UPLOAD_STORAGE_PROVIDER || "local",
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:3000").split(","),
  socketCorsOrigins: (process.env.SOCKET_CORS_ORIGINS || "http://localhost:3000").split(","),
  apiBaseUrl: process.env.API_BASE_URL || "http://localhost:5000",
};
