import bcrypt from "bcryptjs";

const ROUNDS = 10;

export const hashPassword = (password: string) => bcrypt.hash(password, ROUNDS);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

let dummyHash: Promise<string> | undefined;
/** A real hash to compare against when the user doesn't exist, so login timing doesn't leak emails. */
export const getDummyHash = () => (dummyHash ??= bcrypt.hash("not-a-real-password", ROUNDS));
