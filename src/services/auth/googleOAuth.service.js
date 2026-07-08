const { OAuth2Client } = require("google-auth-library");
const env = require("../../config/env");

let client = null;
function getClient() {
  if (!client) client = new OAuth2Client(env.googleOAuth.clientId);
  return client;
}

// The client (web via Google Identity Services JS, or mobile via a native Google
// Sign-In SDK) obtains a signed ID token directly from Google and sends it to us —
// we only need to verify its signature/audience, never a client secret. This keeps
// the same backend endpoint usable from both web and mobile with no redirect dance.
async function verifyGoogleIdToken(idToken) {
  const ticket = await getClient().verifyIdToken({
    idToken,
    audience: env.googleOAuth.clientId,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.sub) throw new Error("Invalid Google ID token");

  return {
    providerId: payload.sub,
    email: payload.email,
    emailVerified: Boolean(payload.email_verified),
    name: payload.name,
  };
}

module.exports = { verifyGoogleIdToken };
