export const USER_ROLES = {
  user: "user",
  admin: "admin",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export function isUserRole(value: unknown): value is UserRole {
  return value === USER_ROLES.user || value === USER_ROLES.admin;
}
