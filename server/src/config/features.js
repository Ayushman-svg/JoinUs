const AppError = require('../utils/AppError');

const FEATURE_NAMES = Object.freeze([
  'LANDING',
  'NEW_HOME',
  'ROOM_VIEWS',
  'REACTIONS',
  'HOST_SECURITY',
  'POLLS',
  'CAPTIONS',
  'CHAT_PLUS',
  'SCHEDULING',
  'SETTINGS',
  'RECORDING',
  'CALENDAR',
  'SEARCH',
  'WHITEBOARD',
  'CONTACTS',
  'TEAM_CHAT',
  'ACCOUNT_RECOVERY',
  'TWO_FACTOR',
  'SOCIAL_LOGIN',
  'TRANSLATION',
  'AI_RECAP',
  'AI_COMPANION',
  'CALENDAR_SYNC',
]);

/**
 * Returns true if the feature env var is 'true' or '1' (case-insensitive).
 * Default is false (fail closed).
 * @param {string} name
 * @returns {boolean}
 */
function isFeatureEnabled(name) {
  if (!FEATURE_NAMES.includes(name)) {
    return false;
  }
  const raw = process.env[`FEATURE_${name}`];
  if (!raw) return false;
  const val = String(raw).trim().toLowerCase();
  return val === 'true' || val === '1' || val === 'on';
}

/**
 * Returns an object mapping all feature flag names to their boolean status.
 * @returns {Record<string, boolean>}
 */
function getFeatures() {
  const result = {};
  for (const name of FEATURE_NAMES) {
    result[name] = isFeatureEnabled(name);
  }
  return result;
}

/**
 * Express middleware to guard routes behind a feature flag.
 * Passes an AppError(403, 'FEATURE_DISABLED') to next() if off.
 * @param {string} name
 */
function requireFeature(name) {
  return (req, res, next) => {
    if (!isFeatureEnabled(name)) {
      return next(new AppError(403, 'FEATURE_DISABLED', `Feature '${name}' is disabled`));
    }
    next();
  };
}

/**
 * Socket assertion helper to guard socket handlers behind a feature flag.
 * Throws AppError(403, 'FEATURE_DISABLED') if off, which on(...) catches.
 * @param {string} name
 */
function assertFeature(name) {
  if (!isFeatureEnabled(name)) {
    throw new AppError(403, 'FEATURE_DISABLED', `Feature '${name}' is disabled`);
  }
}

module.exports = {
  FEATURE_NAMES,
  isFeatureEnabled,
  getFeatures,
  requireFeature,
  assertFeature,
};
