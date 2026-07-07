const levels = ["debug", "info", "warn", "error"];

function log(level, scope, message, meta) {
  const line = `[${new Date().toISOString()}] [${level}] [${scope}] ${message}`;
  const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (meta !== undefined) out(line, meta);
  else out(line);
}

function createLogger(scope) {
  const logger = {};
  for (const level of levels) {
    logger[level] = (message, meta) => log(level, scope, message, meta);
  }
  return logger;
}

module.exports = { createLogger };
