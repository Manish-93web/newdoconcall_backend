const crypto = require("crypto");
const env = require("../../config/env");

// Reuses the JWT access secret as the HMAC key rather than requiring a brand-new env
// var — it's already a required, server-only secret, and this is a distinct signing
// purpose (see the "signed-file:" prefix below) so a leaked file-URL signature can't be
// replayed as anything resembling an access token.
const SECRET = env.jwt.accessSecret;

function sign(fileId, expiresAt) {
  return crypto.createHmac("sha256", SECRET).update(`signed-file:${fileId}:${expiresAt}`).digest("hex");
}

// Short-lived, unauthenticated file URLs — the one deliberate escape hatch from this
// app's normal authenticated-file-access model (see files.controller.js's assertAccess),
// needed because outbound WhatsApp media (Twilio fetches the URL itself; there's no way
// to attach our auth headers to that fetch) must be publicly reachable. Scoped to a
// single file and a short TTL to bound the exposure.
function createSignedFileUrl(fileId, ttlSeconds = 24 * 60 * 60) {
  const id = fileId.toString();
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const sig = sign(id, expiresAt);
  return `${env.apiBaseUrl}/api/v1/files/${id}/signed?expires=${expiresAt}&sig=${sig}`;
}

function verifySignedFileToken(fileId, expires, sig) {
  const expiresAt = Number(expires);
  if (!expiresAt || Date.now() > expiresAt) return false;

  const expected = Buffer.from(sign(fileId.toString(), expiresAt));
  const actual = Buffer.from(String(sig || ""));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

module.exports = { createSignedFileUrl, verifySignedFileToken };
