const AppError = require('../utils/AppError');

// Validates req.body against a zod schema and replaces it with the parsed result
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid request data', details));
    }

    req.body = result.data;
    return next();
  };
}

module.exports = validate;