import type { Task } from "@/stores/taskStore";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AlertCircle, HelpCircle } from "lucide-react";

interface Props {
  task: Task;
  isDragging?: boolean;
}

const priorityColors: Record<string, string> = {
  p0: "bg-red-100 text-red-700 border-red-200",
  p1: "bg-orange-100 text-orange-700 border-orange-200",
  p2: "bg-yellow-100 text-yellow-700 border-yellow-200",
  p3: "bg-gray-100 text-gray-600 border-gray-200",
};

const priorityLabels: Record<string, string> = {
  p0: "P0",
  p1: "P1",
  p2: "P2",
  p3: "P3",
};

export default function TaskCard({ task, isDragging }: Props) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: 50 }
    : undefined;

  const isAwaiting = task.status === "awaiting_human";

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className={`bg-white rounded-lg border p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow ${
        isDragging ? "opacity-50 rotate-2" : ""
      } ${isAwaiting ? "border-l-4 border-l-yellow-400" : ""}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${priorityColors[task.priority] || priorityColors.p3}`}>
          {priorityLabels[task.priority] || task.priority}
        </span>
        {isAwaiting && <HelpCircle size={14} className="text-yellow-500 shrink-0" />}
      </div>

      <h4 className="text-sm font-medium text-gray-800 mb-1 line-clamp-2">{task.title}</h4>

      {task.description && (
        <p className="text-xs text-gray-500 line-clamp-2 mb-2">{task.description}</p>
      )}

      {isAwaiting && task.awaiting_response && (
        <div className="bg-yellow-50 rounded-md p-1.5 mb-2 text-xs text-yellow-700 flex items-start gap-1">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          <span className="line-clamp-2">{task.awaiting_response}</span>
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] text-gray-400">
        <span>#{task.id.slice(0, 6)}</span>
        <span>{new Date(task.created_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
}
