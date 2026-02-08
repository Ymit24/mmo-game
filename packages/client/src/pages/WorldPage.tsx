import { Navigate, useSearchParams } from "react-router-dom";

import { GameShell } from "../game/GameShell";

export function WorldPage() {
  const [searchParams] = useSearchParams();
  const characterId = searchParams.get("characterId");

  if (!characterId) {
    return <Navigate to="/play" replace />;
  }

  return <GameShell characterId={characterId} />;
}
