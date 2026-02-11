import type { CharacterSummary } from "@mmo/shared";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { WorldGrid } from "../components/WorldGrid";
import { CharacterHubTopbar } from "../components/characters/CharacterHubTopbar";
import { deleteCharacter, listCharacters } from "../lib/api/characterApi";
import { getCharacterApiErrorMessage } from "../lib/api/characterApiErrorMessage";

interface DeleteDialogState {
  id: string;
  nickname: string;
}

const CLASS_COLORS: Record<string, string> = {
  knight: "text-vec-gold",
  mage: "text-vec-cyan",
};

const CLASS_BORDER_COLORS: Record<string, string> = {
  knight: "border-vec-gold",
  mage: "border-vec-cyan",
};

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
      <div className="flex min-h-dvh items-center justify-center bg-void text-vec-green font-display text-xs animate-flicker">
        Loading...
      </div>
    );
  }

  return (
    <main className="scanlines min-h-dvh bg-void text-text">
      <WorldGrid />
      <CharacterHubTopbar />

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pb-8 pt-16 md:px-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-lg text-vec-green text-glow-green">
            Characters
          </h1>
          <Link
            to="/characters/new"
            className="border border-border px-3 py-1.5 text-[11px] text-muted hover:border-vec-green/40 hover:text-vec-green transition-colors duration-150"
          >
            + New
          </Link>
        </div>

        {error ? (
          <p
            role="alert"
            className="border border-vec-magenta/40 bg-vec-magenta/5 px-3 py-2 text-xs text-vec-magenta"
          >
            {error}
          </p>
        ) : null}

        {/* Character list */}
        <div className="flex flex-col gap-1">
          {characters.map((character) => {
            const selected = selectedId === character.id;
            const colorClass = CLASS_COLORS[character.class] ?? "text-text";
            const borderClass =
              CLASS_BORDER_COLORS[character.class] ?? "border-border";
            const canDelete = characters.length > 1;

            return (
              <button
                key={character.id}
                type="button"
                onClick={() => setSelectedId(character.id)}
                className={`flex items-center justify-between border p-3 text-left transition-colors duration-100 ${
                  selected
                    ? `${borderClass} bg-surface`
                    : "border-border bg-void/90 hover:border-border-bright"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`font-display text-sm ${colorClass} ${
                      selected ? "" : "opacity-60"
                    }`}
                  >
                    {character.class === "knight" ? "/\\" : "**"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-text-bright truncate">
                      {character.nickname}
                    </p>
                    <p className="text-[10px] text-muted">
                      <span className="capitalize">{character.class}</span>
                      {" Lv."}
                      {character.level}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {selected ? (
                    <span className="text-[10px] uppercase tracking-[0.12em] text-vec-green">
                      Selected
                    </span>
                  ) : null}
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteState({
                          id: character.id,
                          nickname: character.nickname,
                        });
                      }}
                      className="text-[10px] text-vec-magenta/50 hover:text-vec-magenta transition-colors duration-100 px-1"
                    >
                      X
                    </button>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>

        {/* Play button */}
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
          className="w-full border border-vec-green bg-vec-green/10 px-4 py-3 font-display text-sm text-vec-green transition-all duration-150 hover:bg-vec-green/20 glow-green disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          Enter World
        </button>
      </div>

      {/* Delete modal */}
      {deleteState ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-void/95 p-4">
          <div className="w-full max-w-sm border border-vec-magenta/40 bg-void p-5">
            <p className="font-display text-sm text-vec-magenta mb-2">
              Delete {deleteState.nickname}?
            </p>
            <p className="text-xs text-muted mb-3">
              Type{" "}
              <span className="text-text-bright">{deleteState.nickname}</span>{" "}
              to confirm.
            </p>
            <input
              value={deleteInput}
              onChange={(event) => setDeleteInput(event.target.value)}
              className="w-full border border-border bg-deep px-3 py-2 text-sm text-text-bright outline-none focus:border-vec-magenta"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="border border-border px-3 py-1.5 text-xs text-muted hover:border-border-bright transition-colors duration-100"
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
                className="border border-vec-magenta bg-vec-magenta/10 px-3 py-1.5 text-xs text-vec-magenta disabled:cursor-not-allowed disabled:opacity-40"
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
                          "Must keep at least one character.",
                      },
                    });
                    setError(message);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
              >
                {isDeleting ? "Deleting..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
