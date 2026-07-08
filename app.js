const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const env = require("./src/config/env");
const routes = require("./src/routes");
const { notFoundHandler, errorHandler } = require("./src/middleware/errorHandler.middleware");

const app = express();

// Trust the first hop reverse proxy (Render/Heroku/nginx/etc.) so req.secure and
// X-Forwarded-Proto reflect the client's real scheme, not the proxy's internal HTTP hop.
app.set("trust proxy", 1);

if (env.nodeEnv === "production") {
  app.use((req, res, next) => {
    if (req.secure || req.headers["x-forwarded-proto"] === "https") return next();
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  });
}

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true,
  })
);
app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));
app.use(compression());

// Stripe webhook needs the raw body for signature verification, so it's mounted
// with express.raw() BEFORE the global JSON body parser below.
app.use("/api/v1/payments/webhook", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1", routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
