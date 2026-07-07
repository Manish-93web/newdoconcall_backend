const Stripe = require("stripe");
const env = require("../../config/env");
const { ApiError } = require("../../utils/apiResponse");

let stripeClient = null;
function getClient() {
  if (!env.stripe.secretKey) {
    throw new ApiError(501, "PAYMENTS_NOT_CONFIGURED", "Stripe is not configured on this server yet");
  }
  if (!stripeClient) stripeClient = new Stripe(env.stripe.secretKey);
  return stripeClient;
}

async function createPaymentIntent({ amount, currency = "usd", metadata }) {
  const stripe = getClient();
  // Stripe expects the smallest currency unit (cents for usd)
  return stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency,
    metadata,
    automatic_payment_methods: { enabled: true },
  });
}

function constructWebhookEvent(rawBody, signature) {
  const stripe = getClient();
  if (!env.stripe.webhookSecret) {
    throw new ApiError(501, "PAYMENTS_NOT_CONFIGURED", "Stripe webhook secret is not configured");
  }
  return stripe.webhooks.constructEvent(rawBody, signature, env.stripe.webhookSecret);
}

module.exports = { createPaymentIntent, constructWebhookEvent };
