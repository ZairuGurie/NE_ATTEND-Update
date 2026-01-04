/**
 * Standardized error response utility
 * Ensures all API errors follow the same format: { success: false, error: string, message?: string }
 */

/**
 * Send a standardized error response
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} error - Error type/summary
 * @param {string} [message] - Detailed error message (optional)
 * @param {Object} [additional] - Additional fields to include in response
 */
const sendErrorResponse = (res, statusCode, error, message = null, additional = {}) => {
  const response = {
    success: false,
    error: error,
    ...additional
  };
  
  if (message) {
    response.message = message;
  }
  
  return res.status(statusCode).json(response);
};

/**
 * Handle common error types and return standardized responses
 * @param {Object} res - Express response object
 * @param {Error} error - Error object
 * @param {string} defaultMessage - Default error message if error type is unknown
 */
const handleError = (res, error, defaultMessage = 'An error occurred') => {
  console.error('Error:', error);
  
  // Mongoose validation errors
  if (error.name === 'ValidationError') {
    return sendErrorResponse(res, 400, 'Validation error', error.message);
  }
  
  // Mongoose cast errors (invalid ObjectId, etc.)
  if (error.name === 'CastError') {
    return sendErrorResponse(res, 400, 'Invalid data format', `Invalid ${error.path}: ${error.value}`);
  }
  
  // Duplicate key errors
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0];
    return sendErrorResponse(res, 409, 'Duplicate entry', `${field} already exists`);
  }
  
  // Database connection errors
  if (error.message && error.message.includes('No database connection')) {
    return sendErrorResponse(res, 503, 'Database unavailable', 'Database connection is not available. Please try again later.');
  }
  
  // JWT errors
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    return sendErrorResponse(res, 401, 'Authentication error', 'Invalid or expired token');
  }
  
  // Default: return 500 with the error message
  return sendErrorResponse(res, 500, 'Internal server error', process.env.NODE_ENV === 'production' ? defaultMessage : error.message);
};

module.exports = {
  sendErrorResponse,
  handleError
};

