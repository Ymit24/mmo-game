export async function parseJsonBody(request: Request): Promise<unknown | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }

  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function isUniqueConstraintError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return message.includes("unique") || message.includes("constraint");
}
