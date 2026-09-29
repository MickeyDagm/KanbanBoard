export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string) {
    return new ApiError(400, 'BAD_REQUEST', message);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string) {
    return new ApiError(409, 'CONFLICT', message);
  }
  static tooManyRequests(message: string) {
    return new ApiError(429, 'RATE_LIMITED', message);
  }
  static badGateway(message: string) {
    return new ApiError(502, 'BAD_GATEWAY', message);
  }
  static serviceUnavailable(message: string) {
    return new ApiError(503, 'SERVICE_UNAVAILABLE', message);
  }
}
