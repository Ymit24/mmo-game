import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { deleteCharacter, listCharacters } from "../lib/api/characterApi";

interface DeleteDialogState {
  id: string;
  nickname: string;
}

export function CharacterManagePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<
    Awaited<ReturnType<typeof listCharacters>>["characters"]
  >([]);
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

    let cancelled = false;
    (async () => {
      try {
        const result = await listCharacters(token);
        if (cancelled) {
          return;
        }
        setCharacters(result.characters);
      } catch (requestError) {
        if (cancelled) {
          return;
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load characters.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth.token]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-void text-text">
        Loading characters...
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-void px-4 py-8 text-text md:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan">
              Character Control
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold text-text-bright">
              Manage Characters
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/characters/new"
              className="rounded border border-border px-3 py-2 text-sm hover:border-amber/60"
            >
              New Character
            </Link>
            <Link
              to="/play"
              className="rounded border border-border px-3 py-2 text-sm hover:border-amber/60"
            >
              Back to Select
            </Link>
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

        <section className="grid gap-3">
          {characters.map((character) => {
            const canDelete = characters.length > 1;
            return (
              <article
                key={character.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-deep p-4"
              >
                <div>
                  <p className="font-display text-lg text-text-bright">
                    {character.nickname}
                  </p>
                  <p className="text-sm capitalize text-muted">
                    {character.class}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canDelete}
                  onClick={() =>
                    setDeleteState({
                      id: character.id,
                      nickname: character.nickname,
                    })
                  }
                  className="rounded border border-danger/60 px-3 py-2 text-sm text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete
                </button>
              </article>
            );
          })}
        </section>
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
                    setDeleteState(null);
                    setDeleteInput("");
                    const refreshed = await listCharacters(auth.token);
                    setCharacters(refreshed.characters);
                    if (refreshed.characters.length === 0) {
                      navigate("/characters/new", { replace: true });
                    }
                  } catch (requestError) {
                    setError(
                      requestError instanceof Error
                        ? requestError.message
                        : "Delete failed.",
                    );
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
