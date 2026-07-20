const appleSigninAuth = require("apple-signin-auth");
const env = require("../../config/env");

// Mirrors googleOAuth.service.js: the client (web via Apple's JS SDK, or iOS via
// AuthenticationServices/react-native-apple-authentication) obtains a signed identity
// token directly from Apple and sends it to us — we only verify it, no client secret
// or private key needed for this direction. Web tokens carry `aud` = the Services ID;
// native iOS tokens carry `aud` = the app's bundle ID, so we accept either.
async function verifyAppleIdToken(idToken) {
  const audience = [env.appleOAuth.clientId, env.appleOAuth.bundleId].filter(Boolean);
  const payload = await appleSigninAuth.verifyIdToken(idToken, {
    audience: audience.length > 1 ? audience : audience[0],
    ignoreExpiration: false,
  });
  if (!payload || !payload.sub) throw new Error("Invalid Apple ID token");

  return {
    providerId: payload.sub,
    email: payload.email,
    // Apple's email_verified is sometimes the string "true"/"false" rather than boolean.
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    // Apple only sends the user's name on the very first authorization, via a separate
    // `user` JSON field the client must pass through itself — not present in the token.
    name: null,
  };
}

module.exports = { verifyAppleIdToken };
