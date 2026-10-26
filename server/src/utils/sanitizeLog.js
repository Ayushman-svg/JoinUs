/**
 * Sanitizes errors and strings so credentials, connection strings,
 * tokens, and secrets are never printed in logs.
 * @param {any} err
 * @returns {string}
 */
function sanitizeError(err) {
  if (!err) return 'Unknown error';
  let text = typeof err === 'string' ? err : err.stack || err.message || String(err);

  // Redact MongoDB connection strings with usernames and passwords
  text = text.replace(/mongodb(\+srv)?:\/\/[^@/\s]+@/gi, 'mongodb$1://***:***@');

  // Redact Bearer tokens
  text = text.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***');

  // Redact JWT tokens (header.payload.signature)
  text = text.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]+/g, 'eyJ***.***');

  // Redact key/secret/password/token assignments (URL queries, JSON, CLI args)
  text = text.replace(/(api[-_]?key|secret|password|credential|turn_credential|access[-_]?token)\s*[:=]\s*["']?[^"'\s,;]+["']?/gi, '$1=***');

  return text;
}

module.exports = { sanitizeError };
