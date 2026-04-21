import { Route, Routes } from "react-router-dom";
import { AppHeader } from "@/components/f1/AppHeader";
import { HomePage } from "@/pages/HomePage";
import { ModelPage } from "@/pages/ModelPage";
import { ReplayPage } from "@/pages/ReplayPage";

export function App() {
  return (
    <>
      <AppHeader />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/replay" element={<ReplayPage />} />
        <Route path="/model" element={<ModelPage />} />
      </Routes>
    </>
  );
}
