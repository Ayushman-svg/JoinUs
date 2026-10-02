const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('./AppError');

function signToken(userId) {
  return jwt.sign({}, env.jwtSecret, {
    subject: String(userId),
    expiresIn: env.jwtExpiresIn,
    algorithm: 'HS256',
  });
}

// Returns the user id (the "sub" claim). Reused later for the socket handshake.
function verifyToken(token) {
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    return payload.sub;
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Token has expired');
    }
    throw new AppError(401, 'INVALID_TOKEN', 'Invalid token');
  }
}

module.exports = { signToken, verifyToken };