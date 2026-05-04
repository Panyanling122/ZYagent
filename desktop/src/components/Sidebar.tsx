import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useTaskStore } from "@/stores/taskStore";
import { Bot, CheckSquare } from "lucide-react";

export default function Sidebar() {
  const { workspaces, currentId, setCurrent } = useWorkspaceStore();
  const { tasks } = useTaskStore();

  const awaitingCount = tasks.filter((t) => t.status === "awaiting_human").length;

  return (
    <aside className="w-16 bg-gray-900 flex flex-col items-center py-3 gap-1 shrink-0">
      <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mb-2">
        <Bot size={20} className="text-white" />
      </div>

      <div className="w-full px-1">
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            onClick={() => setCurrent(ws.id)}
            title={ws.name}
            className={`w-full h-10 rounded-lg flex items-center justify-center mb-1 transition-colors ${
              currentId === ws.id ? "bg-blue-600/20 text-blue-400" : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            }`}
          >
            <span className="text-lg">{ws.icon || "📁"}</span>
          </button>
        ))}
      </div>

      <div className="mt-auto w-full px-1">
        <div className="relative w-full h-10 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-800 mb-1">
          <CheckSquare size={18} />
          {awaitingCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
              {awaitingCount}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
