import { create } from "zustand";
import { api } from "@/api/client";

export type TaskStatus = "backlog" | "todo" | "in_progress" | "review" | "done" | "cancelled" | "awaiting_human";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: string;
  type: string;
  soul_id?: string;
  topic?: string;
  awaiting_response?: string;
  created_at: string;
}

interface TaskState {
  tasks: Task[];
  isLoading: boolean;
  setTasks: (t: Task[]) => void;
  moveTask: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  addTask: (task: Task) => void;
  fetchTasks: (workspaceId?: string) => Promise<void>;
  createTask: (data: Partial<Task>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
}

const DEV_FALLBACK: Task[] = [
  { id: "t1", title: "客户报价确认", status: "awaiting_human", priority: "p0", type: "mixed", awaiting_response: "涉及金额审批，请选择", created_at: new Date().toISOString() },
  { id: "t2", title: "Q3 报表生成", status: "in_progress", priority: "p1", type: "ai_task", created_at: new Date().toISOString() },
  { id: "t3", title: "产品需求文档", status: "backlog", priority: "p2", type: "human_task", created_at: new Date().toISOString() },
  { id: "t4", title: "数据清洗", status: "todo", priority: "p1", type: "ai_task", created_at: new Date().toISOString() },
];

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  isLoading: false,
  setTasks: (t) => set({ tasks: t }),
  moveTask: async (taskId, newStatus) => {
    const prev = get().tasks.find((t) => t.id === taskId);
    set({ tasks: get().tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)) });
    try {
      await api.tasks.updateStatus(taskId, newStatus, "Dragged on kanban");
    } catch (e) {
      console.error("Move task failed:", e);
      if (prev) set({ tasks: get().tasks.map((t) => (t.id === taskId ? prev : t)) });
    }
  },
  addTask: (task) => set({ tasks: [...get().tasks, task] }),
  fetchTasks: async (workspaceId) => {
    const wsId = workspaceId || localStorage.getItem("currentWorkspaceId") || "";
    if (!wsId) return;
    set({ isLoading: true });
    try {
      const data = await api.tasks.list({ workspace_id: wsId });
      set({ tasks: data.tasks || [] });
    } catch {
      if (import.meta.env.DEV) {
        set({ tasks: DEV_FALLBACK });
      } else {
        set({ tasks: [] });
      }
    } finally {
      set({ isLoading: false });
    }
  },
  createTask: async (data) => {
    const wsId = localStorage.getItem("currentWorkspaceId") || "";
    const userId = localStorage.getItem("userId") || "demo-user";
    const res = await api.tasks.create({ ...data, workspace_id: wsId, created_by: userId, assigned_to: userId });
    set({ tasks: [...get().tasks, res] });
  },
  deleteTask: async (taskId) => {
    await api.tasks.delete(taskId);
    set({ tasks: get().tasks.filter((t) => t.id !== taskId) });
  },
}));
