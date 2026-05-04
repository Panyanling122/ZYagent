import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import ChatPage from "./pages/ChatPage";
import DocumentPage from "./pages/DocumentPage";
import { useAuthStore } from "./stores/authStore";
import QRBindModal from "./components/QRBindModal";
import { useEffect, useState } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { Toaster } from "sonner";

function App() {
  const { checkBound } = useAuthStore();
  const [showBind, setShowBind] = useState(false);
  useWebSocket();

  useEffect(() => {
    checkBound().then((bound) => {
      if (!bound) setShowBind(true);
    });
  }, [checkBound]);

  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/docs" element={<DocumentPage />} />
        </Route>
      </Routes>
      <QRBindModal open={showBind} onClose={() => setShowBind(false)} />
      <Toaster position="top-right" richColors />
    </>
  );
}

export default App;
