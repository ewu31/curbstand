import { loginSchema, signupSchema, type AuthResponse, type MeResponse } from "@curbstand/shared";
import { Prisma } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { authUser, requireAuth } from "../auth/guards";
import { getDummyHash, hashPassword, verifyPassword } from "../auth/password";
import { signToken } from "../auth/token";
import { prisma } from "../lib/db";
import { HttpError, notFound } from "../lib/errors";
import { toUserProfile, userProfileInclude } from "../lib/serializers";

const routes: FastifyPluginAsync = async (app) => {
  app.post("/auth/signup", async (request, reply): Promise<AuthResponse> => {
    const input = signupSchema.parse(request.body);
    const passwordHash = await hashPassword(input.password);

    try {
      const user = await prisma.user.create({
        data: {
          role: input.role,
          name: input.name,
          email: input.email,
          phone: input.phone ?? null,
          passwordHash,
          orgType: input.role === "customer" ? input.orgType : null,
          producerProfile:
            input.role === "producer"
              ? {
                  create: {
                    farmName: input.farmName,
                    serviceRadiusMiles: input.serviceRadiusMiles,
                    farmLatitude: input.farmLatitude,
                    farmLongitude: input.farmLongitude,
                    produceTypes: { create: input.produceTypes.map((produceTypeId) => ({ produceTypeId })) },
                  },
                }
              : undefined,
        },
        include: userProfileInclude,
      });
      reply.status(201);
      return { token: await signToken(user.id), user: toUserProfile(user) };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new HttpError("EMAIL_TAKEN", "An account with this email already exists");
      }
      throw err;
    }
  });

  app.post("/auth/login", async (request): Promise<AuthResponse> => {
    const { email, password } = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email }, include: userProfileInclude });
    const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
    if (!user || !ok) throw new HttpError("INVALID_CREDENTIALS", "Invalid email or password");
    return { token: await signToken(user.id), user: toUserProfile(user) };
  });

  app.get("/me", { preHandler: requireAuth }, async (request): Promise<MeResponse> => {
    const user = await prisma.user.findUnique({
      where: { id: authUser(request).id },
      include: userProfileInclude,
    });
    if (!user) throw notFound("User not found");
    return { user: toUserProfile(user) };
  });
};

export default routes;
