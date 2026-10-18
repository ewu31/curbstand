// Error-response convention. Every non-2xx response body has this shape:
//   { "error": { "code": "FORBIDDEN", "message": "Human readable", "details": <optional> } }

export const ERROR_CODES = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  EMAIL_TAKEN: 409,
  INVALID_TRANSITION: 409,
  DEADLINE_PASSED: 409,
  /** Group buy is not in a status that accepts this action (e.g. joining a matched group buy). */
  GROUP_BUY_CLOSED: 409,
  ALREADY_JOINED: 409,
  ALREADY_MATCHED: 409,
  THRESHOLD_NOT_MET: 409,
  QUANTITY_UNAVAILABLE: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}
