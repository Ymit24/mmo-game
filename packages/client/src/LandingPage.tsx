import { useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "./auth/AuthContext";
import { WorldGrid } from "./components/WorldGrid";
import { APP_VERSION } from "./version";

function VectorSword() {
  return (
    <svg
      viewBox="0 0 64 120"
      className="w-12 h-24 md:w-16 md:h-32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      role="img"
    >
      {/* Blade */}
      <line x1="32" y1="4" x2="32" y2="80" className="text-vec-green" />
      <line x1="28" y1="12" x2="32" y2="4" className="text-vec-green" />
      <line x1="36" y1="12" x2="32" y2="4" className="text-vec-green" />
      <line x1="28" y1="12" x2="28" y2="70" className="text-vec-green" />
      <line x1="36" y1="12" x2="36" y2="70" className="text-vec-green" />
      <line x1="28" y1="70" x2="32" y2="80" className="text-vec-green" />
      <line x1="36" y1="70" x2="32" y2="80" className="text-vec-green" />
      {/* Fuller line */}
      <line
        x1="32"
        y1="16"
        x2="32"
        y2="65"
        className="text-vec-green"
        opacity="0.3"
      />
      {/* Guard */}
      <line x1="20" y1="80" x2="44" y2="80" className="text-vec-gold" />
      <line x1="18" y1="78" x2="20" y2="82" className="text-vec-gold" />
      <line x1="46" y1="78" x2="44" y2="82" className="text-vec-gold" />
      {/* Grip */}
      <line x1="30" y1="82" x2="30" y2="100" className="text-vec-gold" />
      <line x1="34" y1="82" x2="34" y2="100" className="text-vec-gold" />
      {/* Pommel */}
      <circle cx="32" cy="104" r="4" className="text-vec-gold" />
    </svg>
  );
}

export function LandingPage() {
  const auth = useAuth();
  const [hovered, setHovered] = useState(false);

  return (
    <div className="scanlines">
      <WorldGrid />

      <main className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-6">
        {/* Title block */}
        <div className="animate-crt-on flex flex-col items-center gap-6">
          <VectorSword />

          <h1 className="font-display text-3xl md:text-5xl lg:text-6xl text-vec-green text-glow-green text-center leading-tight tracking-wide">
            Realm of Vectors
          </h1>

          <div className="w-32 h-px bg-gradient-to-r from-transparent via-vec-green/40 to-transparent" />
        </div>

        {/* Action buttons */}
        <div
          className="animate-fade-in-up mt-10 flex flex-col items-center gap-4"
          style={{ animationDelay: "0.6s" }}
        >
          <Link
            to={auth.isAuthenticated ? "/play" : "/signup"}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={`
              font-display text-sm md:text-base px-10 py-3 border text-center
              transition-all duration-200
              ${
                hovered
                  ? "border-vec-green bg-vec-green/10 text-vec-green glow-green"
                  : "border-vec-green/60 text-vec-green/80"
              }
            `}
          >
            {auth.isAuthenticated ? "CONTINUE" : "PLAY"}
          </Link>

          {!auth.isAuthenticated ? (
            <Link
              to="/signin"
              className="font-body text-sm text-muted hover:text-vec-green transition-colors duration-200"
            >
              Sign In
            </Link>
          ) : null}
        </div>

        {/* Version tag */}
        <p
          className="animate-fade-in absolute bottom-6 text-xs text-muted/40 font-body"
          style={{ animationDelay: "1s" }}
        >
          v{APP_VERSION}
        </p>
      </main>
    </div>
  );
}
