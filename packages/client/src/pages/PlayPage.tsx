import type { CharacterSummary } from "@mmo/shared";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { CharacterHubTopbar } from "../components/characters/CharacterHubTopbar";
import { deleteCharacter, listCharacters } from "../lib/api/characterApi";
import { getCharacterApiErrorMessage } from "../lib/api/characterApiErrorMessage";

interface DeleteDialogState {
  id: string;
  nickname: string;
}

export function PlayPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteState, setDeleteState] = useState<DeleteDialogState | null>(
    null,
  );
  const [deleteInput, setDeleteInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

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
        const message = getCharacterApiErrorMessage(requestError, {
          fallback: "Unable to load characters.",
          unauthorizedMessage: "Session expired. Please sign in again.",
        });
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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-8 pt-24 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan">
              Character Hub
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold text-text-bright">
              Select and Manage Characters
            </h1>
          </div>
          <Link
            to="/characters/new"
            className="rounded border border-border px-3 py-2 text-sm hover:border-amber/60"
          >
            New Character
          </Link>
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
            const canDelete = characters.length > 1;
            return (
              <article
                key={character.id}
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
                    <p className="mt-1 inline-flex rounded border border-cyan/35 bg-cyan/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan">
                      Lv. {character.level}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {character.isLastUsed ? (
                      <span className="rounded border border-cyan/40 bg-cyan/10 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.14em] text-cyan">
                        Last Used
                      </span>
                    ) : null}
                    <button
                      type="button"
                      disabled={!canDelete}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteState({
                          id: character.id,
                          nickname: character.nickname,
                        });
                      }}
                      className="rounded border border-danger/60 px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.12em] text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedId(character.id)}
                    className={`rounded px-3 py-1.5 text-xs font-mono uppercase tracking-[0.12em] ${
                      selected
                        ? "bg-amber text-void"
                        : "border border-border text-text hover:border-amber/60"
                    }`}
                  >
                    {selected ? "Selected" : "Select"}
                  </button>
                </div>
              </article>
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

      {deleteState ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-void/90 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-abyss p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-danger">
              Confirm Delete
            </p>
            <h2 className="mt-2 font-display text-xl text-text-bright">
              Delete {deleteState.nickname}?
            </h2>
            <p className="mt-2 text-sm text-muted">
              Type{" "}
              <span className="text-text-bright">{deleteState.nickname}</span>{" "}
              to confirm.
            </p>
            <input
              value={deleteInput}
              onChange={(event) => setDeleteInput(event.target.value)}
              className="mt-3 w-full rounded border border-border bg-void px-3 py-2 text-sm text-text-bright outline-none focus:border-danger"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-border px-3 py-2 text-sm hover:border-amber/60"
                onClick={() => {
                  setDeleteState(null);
                  setDeleteInput("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  isDeleting ||
                  deleteInput !== deleteState.nickname ||
                  !auth.token
                }
                className="rounded bg-danger px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
                onClick={async () => {
                  if (!auth.token) {
                    return;
                  }
                  setIsDeleting(true);
                  setError(null);
                  try {
                    await deleteCharacter(auth.token, deleteState.id);
                    const refreshed = await listCharacters(auth.token);
                    setCharacters(refreshed.characters);
                    const nextSelected =
                      refreshed.characters.find(
                        (character) => character.id === selectedId,
                      ) ??
                      refreshed.characters[0] ??
                      null;
                    setSelectedId(nextSelected?.id ?? null);
                    setDeleteState(null);
                    setDeleteInput("");
                    if (refreshed.characters.length === 0) {
                      navigate("/characters/new", { replace: true });
                    }
                  } catch (requestError) {
                    const message = getCharacterApiErrorMessage(requestError, {
                      fallback: "Delete failed.",
                      codeMessages: {
                        CHARACTER_LAST_DELETE_FORBIDDEN:
                          "You must keep at least one character.",
                      },
                    });
                    setError(message);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
              >
                {isDeleting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
