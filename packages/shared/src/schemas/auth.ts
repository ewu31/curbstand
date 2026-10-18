import { z } from "zod";
import { ORG_TYPES, type OrgType, type Role } from "../enums";
import { PRODUCE_TYPE_IDS } from "../catalog";

const email = z.email().transform((e) => e.trim().toLowerCase());
const password = z.string().min(8, "Password must be at least 8 characters").max(128);
const name = z.string().trim().min(1).max(100);
const phone = z.string().trim().min(7).max(30);
export const producerTypeSchema = z.enum(["at_home", "local_farmer", "large_scale_farmer"]);
const farmName = z.string().trim().min(1).max(100);
const produceTypes = z
  .array(z.enum(PRODUCE_TYPE_IDS as [string, ...string[]]))
  .min(1)
  .transform((ids) => [...new Set(ids)]);
const serviceRadiusMiles = z.number().int().min(1).max(250);
const farmLatitude = z.number().min(-90).max(90);
const farmLongitude = z.number().min(-180).max(180);

export const customerSignupSchema = z.object({
  role: z.literal("customer"),
  email,
  password,
  name,
  phone: phone.optional(),
  orgType: z.enum(ORG_TYPES),
});

export const producerSignupSchema = z.object({
  role: z.literal("producer"),
  email,
  password,
  name,
  phone: phone.optional(),
  farmName,
  producerType: producerTypeSchema.default("local_farmer"),
  produceTypes,
  serviceRadiusMiles,
  farmLatitude,
  farmLongitude,
});

export const signupSchema = z.discriminatedUnion("role", [customerSignupSchema, producerSignupSchema]);
export type SignupInput = z.input<typeof signupSchema>;

// PATCH /me — partial update of the caller's own profile. Role, email, and password are not
// editable here. `phone: null` clears the phone number. At least one field is required.
const atLeastOneField = (o: object) => Object.values(o).some((v) => v !== undefined);
const nonEmptyUpdate = "Provide at least one field to update";

export const updateCustomerProfileSchema = z
  .object({
    name: name.optional(),
    phone: phone.nullable().optional(),
    orgType: z.enum(ORG_TYPES).optional(),
  })
  .strict()
  .refine(atLeastOneField, nonEmptyUpdate);

export const updateProducerProfileSchema = z
  .object({
    name: name.optional(),
    phone: phone.nullable().optional(),
    farmName: farmName.optional(),
    producerType: producerTypeSchema.optional(),
    produceTypes: produceTypes.optional(),
    serviceRadiusMiles: serviceRadiusMiles.optional(),
    farmLatitude: farmLatitude.optional(),
    farmLongitude: farmLongitude.optional(),
  })
  .strict()
  .refine(atLeastOneField, nonEmptyUpdate);

export type UpdateCustomerProfileInput = z.input<typeof updateCustomerProfileSchema>;
export type UpdateProducerProfileInput = z.input<typeof updateProducerProfileSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1),
});
export type LoginInput = z.input<typeof loginSchema>;

/** Public user shape returned by /auth/* and GET /me. Never contains credentials. */
export interface UserProfile {
  id: string;
  role: Role;
  isOperator: boolean;
  name: string;
  email: string;
  phone: string | null;
  photoUrl: string | null;
  /** Customers only; null for producers. */
  orgType: OrgType | null;
  /** Producers only; null for customers. */
  producerProfile: {
    farmName: string;
    producerType: "at_home" | "local_farmer" | "large_scale_farmer";
    produceTypes: string[];
    serviceRadiusMiles: number;
    farmLatitude: number;
    farmLongitude: number;
  } | null;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

export interface MeResponse {
  user: UserProfile;
}
