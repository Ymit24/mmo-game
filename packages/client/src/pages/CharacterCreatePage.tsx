import { type CharacterClass, validateCharacterNickname } from "@mmo/shared";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { WorldGrid } from "../components/WorldGrid";
import { CharacterHubTopbar } from "../components/characters/CharacterHubTopbar";
import { createCharacter } from "../lib/api/characterApi";
import { getCharacterApiErrorMessage } from "../lib/api/characterApiErrorMessage";

const CHARACTER_CLASSES: CharacterClass[] = ["knight", "mage"];

const CLASS_INFO: Record<
  CharacterClass,
  { label: string; desc: string; color: string; icon: string }
> = {
  knight: {
    label: "Knight",
    desc: "High HP, melee combat",
    color: "vec-gold",
    icon: "/\\",
  },
  mage: {
    label: "Mage",
    desc: "Ranged attacks, lower HP",
    color: "vec-cyan",
    icon: "**",
  },
};

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

  const selectedInfo = CLASS_INFO[characterClass];

  return (
    <main className="scanlines min-h-dvh bg-void text-text">
      <WorldGrid />
      <CharacterHubTopbar />

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pb-8 pt-16 md:px-6">
        <h1 className="font-display text-lg text-vec-green text-glow-green">
          New Character
        </h1>

        {/* Class selection */}
        <div className="border border-border bg-void/90 p-4">
          <p className="text-[10px] uppercase tracking-[0.15em] text-vec-green/60 mb-3">
            Class
          </p>
          <div className="grid grid-cols-2 gap-2">
            {CHARACTER_CLASSES.map((nextClass) => {
              const info = CLASS_INFO[nextClass];
              const selected = nextClass === characterClass;
              return (
                <button
                  key={nextClass}
                  type="button"
                  onClick={() => setCharacterClass(nextClass)}
                  className={`border p-3 text-left transition-colors duration-100 ${
                    selected
                      ? `border-${info.color} bg-${info.color}/10`
                      : "border-border bg-deep hover:border-border-bright"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-display text-base ${
                        selected ? `text-${info.color}` : "text-muted"
                      }`}
                    >
                      {info.icon}
                    </span>
                    <span
                      className={`font-display text-sm ${
                        selected ? "text-text-bright" : "text-text"
                      }`}
                    >
                      {info.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-muted">{info.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Name input */}
        <form
          className="border border-border bg-void/90 p-4"
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
                { replace: true },
              );
            } catch (requestError) {
              const message = getCharacterApiErrorMessage(requestError, {
                fallback: "Unable to create character.",
                codeMessages: {
                  CHARACTER_MAX_REACHED: "Max of 6 characters reached.",
                  CHARACTER_DUPLICATE_NICKNAME: "Nickname already taken.",
                },
              });
              setError(message);
            } finally {
              setIsSubmitting(false);
            }
          }}
        >
          <p className="text-[10px] uppercase tracking-[0.15em] text-vec-green/60 mb-2">
            Name
          </p>
          <input
            id="nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            maxLength={20}
            className="w-full border border-border bg-deep px-3 py-2 text-sm text-text-bright outline-none focus:border-vec-green placeholder:text-muted/40"
            placeholder="Enter nickname"
            autoComplete="off"
          />
          <p className="mt-1.5 text-[10px] text-muted/60">
            3-20 chars, starts with a letter.
          </p>

          {error ? (
            <p
              role="alert"
              className="mt-3 border border-vec-magenta/40 bg-vec-magenta/5 px-3 py-2 text-xs text-vec-magenta"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className={`mt-4 w-full border border-${selectedInfo.color} bg-${selectedInfo.color}/10 px-3 py-2 font-display text-xs text-${selectedInfo.color} transition-colors duration-150 hover:bg-${selectedInfo.color}/20 disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {isSubmitting ? "Creating..." : "Create Character"}
          </button>
        </form>
      </div>
    </main>
  );
}
