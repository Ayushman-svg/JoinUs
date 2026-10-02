const AppError = require('../utils/AppError');
const { isProduction } = require('../config/env');

function notFound(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`));
}

// Express recognizes error handlers by their 4-argument signature
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  let error = err;

  // Errors thrown by express.json()
  if (err.type === 'entity.parse.failed') {
    error = new AppError(400, 'INVALID_JSON', 'Request body contains invalid JSON');
  } else if (err.type === 'entity.too.large') {
    error = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }

  const isAppError = error instanceof AppError;
  const status = isAppError ? error.statusCode : 500;

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    error: {
      code: isAppError ? error.code : 'INTERNAL_ERROR',
      // Never leak internal error details in production
      message: isAppError || !isProduction ? error.message : 'Something went wrong',
      ...(isAppError && error.details ? { details: error.details } : {}),
    },
  });
}

module.exports = { notFound, errorHandler };