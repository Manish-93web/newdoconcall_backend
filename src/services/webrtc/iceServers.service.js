const crypto = require("crypto");
const env = require("../../config/env");

const DEFAULT_STUN_URLS = ["stun:stun.l.google.com:19302"];
const CREDENTIAL_TTL_SECONDS = 3600;

// coturn's REST API auth scheme (use-auth-secret): username is "<expiry>:<label>", and
// the password is HMAC-SHA1(staticSecret, username) base64-encoded. This avoids ever
// shipping a permanent TURN password inside the public web bundle / mobile app binary —
// each client gets a fresh credential that expires in an hour.
function buildTurnServer(userId) {
  const { staticSecret, urls } = env.webrtc.turn;
  if (!staticSecret || urls.length === 0) return null;

  const expiresAt = Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_SECONDS;
  const username = `${expiresAt}:${userId}`;
  const credential = crypto.createHmac("sha1", staticSecret).update(username).digest("base64");

  return { urls, username, credential };
}

function getIceServers(userId) {
  const stunUrls = env.webrtc.stunUrls.length > 0 ? env.webrtc.stunUrls : DEFAULT_STUN_URLS;
  const iceServers = [{ urls: stunUrls }];

  const turnServer = buildTurnServer(userId);
  if (turnServer) iceServers.push(turnServer);

  return { iceServers, ttlSeconds: CREDENTIAL_TTL_SECONDS };
}

module.exports = { getIceServers };
