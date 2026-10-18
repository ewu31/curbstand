export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function actionError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Log in with a seeded demo account to do that.";
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong.";
}
