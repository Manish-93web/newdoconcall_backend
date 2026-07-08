const RevokedToken = require("../../models/RevokedToken");

async function revokeToken(jti, expiresAt) {
  if (!jti || !expiresAt) return;
  await RevokedToken.updateOne({ jti }, { $setOnInsert: { jti, expiresAt } }, { upsert: true });
}

async function isTokenRevoked(jti) {
  if (!jti) return false;
  const found = await RevokedToken.exists({ jti });
  return Boolean(found);
}

module.exports = { revokeToken, isTokenRevoked };
