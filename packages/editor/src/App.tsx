import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { EditorLayout } from "./components/EditorLayout";
import { EnemiesPage } from "./pages/EnemiesPage";
import { ItemsPage } from "./pages/ItemsPage";
import { LevelProgressionPage } from "./pages/LevelProgressionPage";
import { LootTablesPage } from "./pages/LootTablesPage";
import { MapsPage } from "./pages/MapsPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<EditorLayout />}>
          <Route path="/enemies" element={<EnemiesPage />} />
          <Route path="/items" element={<ItemsPage />} />
          <Route path="/loot" element={<LootTablesPage />} />
          <Route path="/levels" element={<LevelProgressionPage />} />
          <Route path="/maps" element={<MapsPage />} />
          <Route path="*" element={<Navigate to="/enemies" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
