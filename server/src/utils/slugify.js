const { randomBytes } = require('crypto');

function generateUserSlug(name) {
  const base = (name || 'user')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'room';
  const suffix = randomBytes(2).toString('hex');
  return `${base}-${suffix}`;
}

module.exports = { generateUserSlug };
