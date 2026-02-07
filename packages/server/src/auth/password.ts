const PASSWORD_HASH_OPTIONS = {
  algorithm: "argon2id",
} as const;

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, PASSWORD_HASH_OPTIONS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return Bun.password.verify(password, passwordHash);
}
