import { CHARACTER_ERROR_CODES, type CharacterErrorCode } from "@mmo/shared";

import { CharacterApiError } from "./characterApi";

interface CharacterApiErrorMessageOptions {
  fallback: string;
  unauthorizedMessage?: string;
  codeMessages?: Partial<Record<CharacterErrorCode, string>>;
}

export function getCharacterApiErrorMessage(
  error: unknown,
  options: CharacterApiErrorMessageOptions,
): string {
  if (error instanceof CharacterApiError) {
    const override = options.codeMessages?.[error.code];
    if (override) {
      return override;
    }
    if (
      options.unauthorizedMessage &&
      error.code === CHARACTER_ERROR_CODES.unauthorized
    ) {
      return options.unauthorizedMessage;
    }
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return options.fallback;
}
