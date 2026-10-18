import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from "@curbstand/shared";
import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";

/** Throw from any handler/guard; the error handler turns it into the shared error shape. */
export class HttpError extends Error {
  readonly statusCode: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.statusCode = ERROR_CODES[code];
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError("VALIDATION_ERROR", message, details);
export const unauthorized = (message = "Authentication required") => new HttpError("UNAUTHORIZED", message);
export const forbidden = (message = "You do not have permission to perform this action") =>
  new HttpError("FORBIDDEN", message);
export const notFound = (message = "Not found") => new HttpError("NOT_FOUND", message);
export const conflict = (message: string, details?: unknown) => new HttpError("CONFLICT", message, details);
export const invalidTransition = (from: string, to: string) =>
  new HttpError("INVALID_TRANSITION", `Cannot transition from '${from}' to '${to}'`, { from, to });
export const deadlinePassed = (deadline: "join" | "bid", at: Date) =>
  new HttpError("DEADLINE_PASSED", `The ${deadline} deadline has passed`, { deadline, at: at.toISOString() });

function body(code: ErrorCode, message: string, details?: unknown): ApiErrorBody {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

export function registerErrorHandling(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError | HttpError | ZodError, request, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send(body(err.code, err.message, err.details));
    }
    if (err instanceof ZodError) {
      const issues = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
      return reply.status(400).send(body("VALIDATION_ERROR", "Invalid request", issues));
    }
    // Fastify's own client errors (malformed JSON, body too large, ...)
    if (err.statusCode === 413) {
      return reply.status(413).send(body("PAYLOAD_TOO_LARGE", "Request body is too large"));
    }
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.status(err.statusCode).send(body("VALIDATION_ERROR", err.message));
    }
    request.log.error({ err }, "unhandled error");
    return reply.status(500).send(body("INTERNAL_ERROR", "Internal server error"));
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(body("NOT_FOUND", `Route ${request.method} ${request.url} not found`));
  });
}
