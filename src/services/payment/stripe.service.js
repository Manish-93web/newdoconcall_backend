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

async function createPaymentIntent({ amount, currency = "inr", metadata }) {
  const stripe = getClient();
  // All amounts in this app are quoted in ₹ (INR) in the UI — defaulting to "usd" here
  // would silently charge cardholders in dollars for a rupee-denominated fee.
  // Stripe expects the smallest currency unit (paise for inr, i.e. amount * 100).
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

// Actively asks Stripe for a PaymentIntent's current status, rather than passively waiting
// on the webhook — used to reconcile right after the client reports success, since the
// webhook is a separate, unordered round-trip that can lag behind (or, in an environment
// with no webhook forwarding configured, never arrive at all).
async function retrievePaymentIntent(id) {
  const stripe = getClient();
  return stripe.paymentIntents.retrieve(id);
}

module.exports = { createPaymentIntent, constructWebhookEvent, retrievePaymentIntent };
