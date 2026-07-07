const { ApiError } = require("../utils/apiResponse");

function validate(schema, property = "body") {
  return function validateMiddleware(req, res, next) {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      const details = error.details.map((d) => ({ message: d.message, path: d.path }));
      return next(new ApiError(400, "VALIDATION_ERROR", "Invalid request data", details));
    }
    req[property] = value;
    return next();
  };
}

module.exports = { validate };
