const xss = require("xss");

// Strips/escapes HTML so stored freeform text (article bodies, bios, review comments,
// complaint descriptions) can't carry a script payload if a future surface ever renders
// it as raw HTML (dangerouslySetInnerHTML on web, a WebView on mobile). Not applied
// globally in validate.middleware — blindly sanitizing every field would also mangle
// passwords/tokens containing "<"/">", so this is opt-in per freeform field instead.
function sanitizeText(value) {
  if (typeof value !== "string") return value;
  return xss(value, { whiteList: {}, stripIgnoreTag: true, stripIgnoreTagBody: ["script", "style"] });
}

module.exports = { sanitizeText };
