import { z } from "zod";
import { ORG_TYPES, type OrgType, type Role } from "../enums";
import { PRODUCE_TYPE_IDS } from "../catalog";

const email = z.email().transform((e) => e.trim().toLowerCase());
const password = z.string().min(8, "Password must be at least 8 characters").max(128);
const name = z.string().trim().min(1).max(100);
const phone = z.string().trim().min(7).max(30).optional();

export const customerSignupSchema = z.object({
  role: z.literal("customer"),
  email,
  password,
  name,
  phone,
  orgType: z.enum(ORG_TYPES),
});

export const producerSignupSchema = z.object({
  role: z.literal("producer"),
  email,
  password,
  name,
  phone,
  farmName: z.string().trim().min(1).max(100),
  produceTypes: z
    .array(z.enum(PRODUCE_TYPE_IDS as [string, ...string[]]))
    .min(1)
    .transform((ids) => [...new Set(ids)]),
  serviceRadiusMiles: z.number().int().min(1).max(250),
  farmLatitude: z.number().min(-90).max(90),
  farmLongitude: z.number().min(-180).max(180),
});

export const signupSchema = z.discriminatedUnion("role", [customerSignupSchema, producerSignupSchema]);
export type SignupInput = z.input<typeof signupSchema>;

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
  /** Customers only; null for producers. */
  orgType: OrgType | null;
  /** Producers only; null for customers. */
  producerProfile: {
    farmName: string;
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
