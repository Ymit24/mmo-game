import {
  type CharacterClass,
  getCharacterClassColorHex,
  validateCharacterNickname,
} from "@mmo/shared";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { CharacterApiError, createCharacter } from "../lib/api/characterApi";

const CHARACTER_CLASSES: CharacterClass[] = ["knight", "mage"];

export function CharacterCreatePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const token = auth.token;
  const [nickname, setNickname] = useState("");
  const [characterClass, setCharacterClass] =
    useState<CharacterClass>("knight");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!token) {
    return null;
  }

  return (
    <main className="min-h-dvh bg-void px-4 py-8 text-text md:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan">
              Character Setup
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold text-text-bright">
              Create Your First Character
            </h1>
          </div>
          <Link
            to="/play"
            className="rounded border border-border px-3 py-2 text-sm hover:border-amber/60"
          >
            Back to Character Select
          </Link>
        </header>

        <section className="grid gap-6 rounded-xl border border-border bg-abyss/80 p-5 md:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan">
              Class
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {CHARACTER_CLASSES.map((nextClass) => {
                const selected = nextClass === characterClass;
                return (
                  <button
                    key={nextClass}
                    type="button"
                    onClick={() => setCharacterClass(nextClass)}
                    className={`rounded-lg border p-4 text-left transition ${
                      selected
                        ? "border-amber bg-surface"
                        : "border-border bg-deep hover:border-amber/40"
                    }`}
                  >
                    <p className="font-display text-lg capitalize text-text-bright">
                      {nextClass}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      Primary color: {getCharacterClassColorHex(nextClass)}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <form
            className="rounded-lg border border-border bg-deep p-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);

              const nicknameError = validateCharacterNickname(nickname);
              if (nicknameError) {
                setError(nicknameError);
                return;
              }

              setIsSubmitting(true);
              try {
                const response = await createCharacter(token, {
                  nickname: nickname.trim(),
                  class: characterClass,
                });
                navigate(
                  `/world?characterId=${encodeURIComponent(response.character.id)}`,
                  {
                    replace: true,
                  },
                );
              } catch (requestError) {
                const message =
                  requestError instanceof CharacterApiError
                    ? requestError.code === "CHARACTER_MAX_REACHED"
                      ? "You reached the max of 6 characters."
                      : requestError.code === "CHARACTER_DUPLICATE_NICKNAME"
                        ? "That nickname is already used on this account."
                        : requestError.message
                    : requestError instanceof Error
                      ? requestError.message
                      : "Unable to create character.";
                setError(message);
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan">
              Identity
            </p>
            <label
              className="mt-3 block text-sm text-text-bright"
              htmlFor="nickname"
            >
              Nickname
            </label>
            <input
              id="nickname"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={20}
              className="mt-1 w-full rounded border border-border bg-void px-3 py-2 text-sm text-text-bright outline-none focus:border-amber"
              placeholder="Ex: EmberKnight"
              autoComplete="off"
            />
            <p className="mt-2 text-xs text-muted">
              3-20 chars, starts with a letter, letters/numbers/underscores.
            </p>

            {error ? (
              <p
                role="alert"
                className="mt-3 rounded border border-danger/50 bg-danger/10 p-2 text-sm text-danger"
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-4 w-full rounded bg-amber px-3 py-2 font-display text-sm text-void hover:bg-amber-glow disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Creating..." : "Create Character"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
