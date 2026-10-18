import { jwtVerify, SignJWT } from "jose";
import { config } from "../config";

const secret = new TextEncoder().encode(config.jwtSecret);
const ISSUER = "curbstand-api";

/** Stateless bearer token. Only the user id is embedded; role is re-read from the DB per request. */
export function signToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(config.jwtExpiresIn)
    .sign(secret);
}

/** Returns the user id, or null if the token is invalid/expired. */
export async function verifyToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
