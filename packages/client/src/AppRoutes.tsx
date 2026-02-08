import { Navigate, Route, Routes } from "react-router-dom";

import { LandingPage } from "./LandingPage";
import { RequireAuth } from "./auth/RequireAuth";
import { CharacterCreatePage } from "./pages/CharacterCreatePage";
import { CharacterManagePage } from "./pages/CharacterManagePage";
import { PlayPage } from "./pages/PlayPage";
import { SigninPage } from "./pages/SigninPage";
import { SignupPage } from "./pages/SignupPage";
import { WorldPage } from "./pages/WorldPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/signin" element={<SigninPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/characters/new" element={<CharacterCreatePage />} />
        <Route path="/characters" element={<CharacterManagePage />} />
        <Route path="/play" element={<PlayPage />} />
        <Route path="/world" element={<WorldPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
