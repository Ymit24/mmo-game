import { Navigate, Route, Routes } from "react-router-dom";

import { LandingPage } from "./LandingPage";
import { RequireAuth } from "./auth/RequireAuth";
import { PlayPage } from "./pages/PlayPage";
import { SigninPage } from "./pages/SigninPage";
import { SignupPage } from "./pages/SignupPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/signin" element={<SigninPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/play" element={<PlayPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
