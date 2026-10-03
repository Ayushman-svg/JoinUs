const AppError = require('../utils/AppError');

// Validates req[target] against a zod schema.
// body: replaces req.body with the parsed result.
// params/query: stored in req.valid[target] (req.query is read-only in Express 5).
function validate(schema, target = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[target] ?? {});

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid request data', details));
    }

    if (target === 'body') {
      req.body = result.data;
    } else {
      req.valid = { ...req.valid, [target]: result.data };
    }
    return next();
  };
}

module.exports = validate;