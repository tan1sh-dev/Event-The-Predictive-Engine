import { Navigate, Route, Routes } from "react-router-dom";
import HostPage from "./pages/HostPage";
import PlayPage from "./pages/PlayPage";
import StagePage from "./pages/StagePage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/play" replace />} />
      <Route path="/play" element={<PlayPage />} />
      <Route path="/stage" element={<StagePage />} />
      <Route path="/host" element={<HostPage />} />
    </Routes>
  );
}
