import type { CharacterSummary } from "@mmo/shared";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { CharacterHubTopbar } from "../components/characters/CharacterHubTopbar";
import { CharacterApiError, listCharacters } from "../lib/api/characterApi";

export function PlayPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = auth.token;
    if (!token) {
      return;
    }

    let isCancelled = false;
    (async () => {
      try {
        const result = await listCharacters(token);
        if (isCancelled) {
          return;
        }
        setCharacters(result.characters);
        if (result.characters.length === 0) {
          navigate("/characters/new", { replace: true });
          return;
        }
        const preferred =
          result.characters.find((character) => character.isLastUsed) ??
          result.characters[0];
        setSelectedId(preferred?.id ?? null);
      } catch (requestError) {
        if (isCancelled) {
          return;
        }
        const message =
          requestError instanceof CharacterApiError
            ? requestError.code === "CHARACTER_UNAUTHORIZED"
              ? "Session expired. Please sign in again."
              : requestError.message
            : requestError instanceof Error
              ? requestError.message
              : "Unable to load characters.";
        setError(message);
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [auth.token, navigate]);

  const selectedCharacter = useMemo(
    () => characters.find((character) => character.id === selectedId) ?? null,
    [characters, selectedId],
  );

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-void text-text">
        Loading characters...
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-void text-text">
      <CharacterHubTopbar />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
        <header className="flex flex-wrap items-center gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan">
              Deployment Bay
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold text-text-bright">
              Choose Character
            </h1>
          </div>
        </header>

        {error ? (
          <p
            role="alert"
            className="rounded border border-danger/50 bg-danger/10 p-3 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2">
          {characters.map((character) => {
            const selected = selectedId === character.id;
            return (
              <button
                key={character.id}
                type="button"
                onClick={() => setSelectedId(character.id)}
                className={`rounded-lg border p-4 text-left transition ${
                  selected
                    ? "border-amber bg-surface"
                    : "border-border bg-deep hover:border-amber/40"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-xl text-text-bright">
                      {character.nickname}
                    </p>
                    <p className="text-sm capitalize text-muted">
                      {character.class}
                    </p>
                  </div>
                  {character.isLastUsed ? (
                    <span className="rounded border border-cyan/40 bg-cyan/10 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.14em] text-cyan">
                      Last Used
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </section>

        <footer className="rounded-lg border border-border bg-abyss/75 p-4">
          <p className="text-sm text-muted">
            Selected:{" "}
            <span className="font-display text-base text-text-bright">
              {selectedCharacter?.nickname ?? "None"}
            </span>
          </p>
          <button
            type="button"
            disabled={!selectedCharacter}
            onClick={() => {
              if (!selectedCharacter) {
                return;
              }
              navigate(
                `/world?characterId=${encodeURIComponent(selectedCharacter.id)}`,
              );
            }}
            className="mt-3 rounded bg-amber px-4 py-2 font-display text-sm text-void hover:bg-amber-glow disabled:cursor-not-allowed disabled:opacity-70"
          >
            Enter World
          </button>
        </footer>
      </div>
    </main>
  );
}
