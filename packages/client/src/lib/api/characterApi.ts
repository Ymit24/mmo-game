import type {
  CharacterErrorResponse,
  CreateCharacterRequest,
  CreateCharacterResponse,
  ListCharactersResponse,
} from "@mmo/shared";

import { API_BASE_URL } from "../../config/env";

const JSON_HEADERS = {
  "content-type": "application/json",
} as const;

function authHeaders(token: string): HeadersInit {
  return {
    ...JSON_HEADERS,
    authorization: `Bearer ${token}`,
  };
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Partial<CharacterErrorResponse>;
    if (typeof body.error === "string" && body.error.length > 0) {
      return body.error;
    }
  } catch {
    // fall through
  }
  return "Request failed. Please try again.";
}

export async function listCharacters(
  token: string,
): Promise<ListCharactersResponse> {
  const response = await fetch(`${API_BASE_URL}/characters`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as ListCharactersResponse;
}

export async function createCharacter(
  token: string,
  payload: CreateCharacterRequest,
): Promise<CreateCharacterResponse> {
  const response = await fetch(`${API_BASE_URL}/characters`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as CreateCharacterResponse;
}

export async function deleteCharacter(
  token: string,
  characterId: string,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/characters/${characterId}`, {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
}
