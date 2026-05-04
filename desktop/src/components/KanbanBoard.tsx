import { useTaskStore, type TaskStatus } from "@/stores/taskStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useEffect, useState } from "react";
import TaskCard from "./TaskCard";
import { DndContext, type DragEndEvent, useDroppable } from "@dnd-kit/core";

const COLUMNS: { id: TaskStatus; title: string; color: string }[] = [
  { id: "backlog", title: "📥 待办", color: "bg-gray-100" },
  { id: "todo", title: "📋 准备", color: "bg-blue-50" },
  { id: "in_progress", title: "🔄 进行中", color: "bg-yellow-50" },
  { id: "review", title: "👀 审核", color: "bg-purple-50" },
  { id: "done", title: "✅ 完成", color: "bg-green-50" },
];

function DroppableColumn({ col, count, children }: { col: typeof COLUMNS[0]; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <div
      ref={setNodeRef}
      data-status={col.id}
      className={`${col.color} rounded-xl border w-64 shrink-0 flex flex-col transition-colors ${isOver ? "ring-2 ring-blue-400 ring-offset-2" : ""}`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b bg-white/60 rounded-t-xl">
        <span className="font-semibold text-sm text-gray-700">{col.title}</span>
        <span className="text-xs bg-gray-200 px-1.5 py-0.5 rounded-full text-gray-600">
          {count}
        </span>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[120px]">
        {children}
      </div>
    </div>
  );
}

export default function KanbanBoard() {
  const { tasks, fetchTasks, moveTask } = useTaskStore();
  const { currentId } = useWorkspaceStore();
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    if (currentId) fetchTasks(currentId);
  }, [currentId, fetchTasks]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggingId(null);
    if (!over) return;
    const newStatus = over.id as TaskStatus;
    moveTask(active.id as string, newStatus);
  };

  return (
    <DndContext onDragStart={({ active }) => setDraggingId(active.id as string)} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 h-full overflow-x-auto pb-2">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);
          return (
            <DroppableColumn key={col.id} col={col} count={colTasks.length}>
              {colTasks.map((task) => (
                <TaskCard key={task.id} task={task} isDragging={draggingId === task.id} />
              ))}
            </DroppableColumn>
          );
        })}
      </div>
    </DndContext>
  );
}
