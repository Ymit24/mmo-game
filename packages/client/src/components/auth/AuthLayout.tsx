import type { PropsWithChildren, ReactNode } from "react";

import { Link } from "react-router-dom";
import { WorldGrid } from "../WorldGrid";

interface AuthLayoutProps extends PropsWithChildren {
  title: string;
  subtitle: string;
  footer: ReactNode;
}

export function AuthLayout({
  title,
  subtitle,
  footer,
  children,
}: AuthLayoutProps) {
  return (
    <div className="scanlines relative min-h-dvh overflow-hidden">
      <WorldGrid />

      <header className="relative z-10 px-4 py-3 md:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs text-vec-green/70 hover:text-vec-green transition-colors duration-150"
        >
          <span className="font-display text-sm tracking-wider">RoV</span>
        </Link>
      </header>

      <main className="relative z-10 flex items-center justify-center px-4 pb-8 md:px-6">
        <div className="w-full max-w-sm border border-vec-green/30 bg-void/95 p-6 md:p-8">
          {/* Corner accents */}
          <div className="relative">
            <div className="absolute -top-6 -left-6 w-3 h-3 border-t-2 border-l-2 border-vec-green md:-top-8 md:-left-8" />
            <div className="absolute -top-6 -right-6 w-3 h-3 border-t-2 border-r-2 border-vec-green md:-top-8 md:-right-8" />
            <div className="absolute -bottom-6 -left-6 w-3 h-3 border-b-2 border-l-2 border-vec-green md:-bottom-8 md:-left-8" />
            <div className="absolute -bottom-6 -right-6 w-3 h-3 border-b-2 border-r-2 border-vec-green md:-bottom-8 md:-right-8" />
          </div>

          <h1 className="font-display text-lg text-vec-green text-glow-green mb-1">
            {title}
          </h1>
          <p className="text-xs text-muted mb-6">{subtitle}</p>

          {children}

          <div className="mt-5 pt-4 border-t border-border/50 text-xs text-muted">
            {footer}
          </div>
        </div>
      </main>
    </div>
  );
}
