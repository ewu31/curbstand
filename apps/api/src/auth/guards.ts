import type { Role } from "@curbstand/shared";
import { isOneOf, ROLES } from "@curbstand/shared";
import type { FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import { prisma } from "../lib/db";
import { forbidden, notFound, unauthorized } from "../lib/errors";
import { verifyToken } from "./token";

// Reusable authorization guards. Use as route preHandlers:
//
//   app.post("/group-buys", { preHandler: requireCustomer }, async (req) => {
//     const user = authUser(req);
//     ...
//   });
//
// Status codes: 401 when no/invalid credentials, 403 when authenticated but not allowed.

export interface AuthUser {
  id: string;
  role: Role;
  isOperator: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    authUser: AuthUser | null;
  }
}

async function resolveUser(request: FastifyRequest): Promise<AuthUser | null> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const userId = await verifyToken(header.slice("Bearer ".length).trim());
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isOperator: true },
  });
  if (!user || !isOneOf(ROLES, user.role)) return null;
  return { id: user.id, role: user.role, isOperator: user.isOperator };
}

/** Requires a valid bearer token. Populates `request.authUser`. */
export const requireAuth: preHandlerAsyncHookHandler = async (request) => {
  if (request.authUser) return;
  const user = await resolveUser(request);
  if (!user) throw unauthorized();
  request.authUser = user;
};

/** Requires an authenticated user with one of the given roles. */
export function requireRole(...roles: Role[]): preHandlerAsyncHookHandler {
  return async function (request, reply) {
    await requireAuth.call(this, request, reply);
    if (!roles.includes(request.authUser!.role)) {
      throw forbidden(`This action requires role: ${roles.join(" or ")}`);
    }
  };
}

export const requireCustomer = requireRole("customer");
export const requireProducer = requireRole("producer");

/** Requires an operator/admin user (seeded; manual deposit and cancellation actions). */
export const requireOperator: preHandlerAsyncHookHandler = async function (request, reply) {
  await requireAuth.call(this, request, reply);
  if (!request.authUser!.isOperator) throw forbidden("This action requires an operator");
};

/**
 * Requires that the authenticated user owns the resource.
 * `getOwnerId` returns the owner's user id, or null if the resource does not exist (-> 404).
 */
export function requireOwner(
  getOwnerId: (request: FastifyRequest) => Promise<string | null>,
  options: { allowOperator?: boolean } = {},
): preHandlerAsyncHookHandler {
  return async function (request, reply) {
    await requireAuth.call(this, request, reply);
    const ownerId = await getOwnerId(request);
    if (ownerId === null) throw notFound();
    assertOwner(request.authUser!, ownerId, options);
  };
}

/** Imperative ownership check for use inside handlers. Throws 403. */
export function assertOwner(user: AuthUser, ownerId: string, options: { allowOperator?: boolean } = {}) {
  if (user.id === ownerId) return;
  if (options.allowOperator && user.isOperator) return;
  throw forbidden("You do not own this resource");
}

/** The authenticated user. Call only in routes protected by one of the guards above. */
export function authUser(request: FastifyRequest): AuthUser {
  if (!request.authUser) throw unauthorized();
  return request.authUser;
}
