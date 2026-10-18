export class FulfillmentError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 409
  readonly code: "bad_request" | "unauthorized" | "forbidden" | "not_found" | "conflict"

  constructor(
    status: 400 | 401 | 403 | 404 | 409,
    code: "bad_request" | "unauthorized" | "forbidden" | "not_found" | "conflict",
    message: string,
  ) {
    super(message)
    this.name = "FulfillmentError"
    this.status = status
    this.code = code
  }
}

export function requireActor(actor: { userId: string } | null): asserts actor is { userId: string } {
  if (!actor) {
    throw new FulfillmentError(401, "unauthorized", "Sign in is required.")
  }
}
