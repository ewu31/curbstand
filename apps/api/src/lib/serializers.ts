import type { OrgType, Role, UserProfile } from "@curbstand/shared";
import type { Prisma } from "@prisma/client";

export const userProfileInclude = {
  producerProfile: { include: { produceTypes: { select: { produceTypeId: true } } } },
} satisfies Prisma.UserInclude;

type UserWithProfile = Prisma.UserGetPayload<{ include: typeof userProfileInclude }>;

export function toUserProfile(user: UserWithProfile): UserProfile {
  const p = user.producerProfile;
  return {
    id: user.id,
    role: user.role as Role,
    isOperator: user.isOperator,
    name: user.name,
    email: user.email,
    phone: user.phone,
    orgType: (user.orgType as OrgType | null) ?? null,
    producerProfile: p
      ? {
          farmName: p.farmName,
          produceTypes: p.produceTypes.map((t) => t.produceTypeId).sort(),
          serviceRadiusMiles: p.serviceRadiusMiles,
          farmLatitude: p.farmLatitude,
          farmLongitude: p.farmLongitude,
        }
      : null,
    createdAt: user.createdAt.toISOString(),
  };
}
