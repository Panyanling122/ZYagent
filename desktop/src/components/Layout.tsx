import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import ChatPanel from "./ChatPanel";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useEffect } from "react";
import { LayoutDashboard, MessageSquare, FileText } from "lucide-react";

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { fetchWorkspaces } = useWorkspaceStore();

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const tabs = [
    { path: "/", label: "看板", icon: LayoutDashboard },
    { path: "/chat", label: "对话", icon: MessageSquare },
    { path: "/docs", label: "文档", icon: FileText },
  ];

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Top Bar */}
      <header className="h-12 bg-white border-b flex items-center px-4 gap-4 shrink-0">
        <div className="font-bold text-lg text-blue-600">OpenClaw</div>
        <nav className="flex gap-1 ml-4">
          {tabs.map((t) => (
            <button
              key={t.path}
              onClick={() => navigate(t.path)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                location.pathname === t.path
                  ? "bg-blue-50 text-blue-600"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>
        <ChatPanel />
      </div>
    </div>
  );
}
