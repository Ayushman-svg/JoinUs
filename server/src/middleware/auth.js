const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../utils/token');
const User = require('../models/User');

// Requires "Authorization: Bearer <jwt>" and attaches the user to req.user
const requireAuth = asyncHandler(async (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');

  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  const userId = verifyToken(token);
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User no longer exists');
  }

  req.user = user;
  next();
});

// Optionally extracts Bearer token and attaches user if valid, continues without error if absent
const optionalAuth = asyncHandler(async (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');

  if (scheme && scheme.toLowerCase() === 'bearer' && token) {
    try {
      const userId = verifyToken(token);
      const user = await User.findById(userId);
      if (user) {
        req.user = user;
      }
    } catch {
      // Ignore token verification errors for optional auth
    }
  }

  next();
});

module.exports = { requireAuth, optionalAuth };