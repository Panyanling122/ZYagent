import { create } from "zustand";
import { api } from "@/api/client";

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  role?: string;
  souls?: { id: string; name: string; status: string }[];
}

interface WorkspaceState {
  workspaces: Workspace[];
  currentId: string | null;
  isLoading: boolean;
  setWorkspaces: (ws: Workspace[]) => void;
  setCurrent: (id: string) => void;
  fetchWorkspaces: () => Promise<void>;
  createWorkspace: (data: Partial<Workspace>) => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  currentId: localStorage.getItem("currentWorkspaceId"),
  isLoading: false,
  setWorkspaces: (ws) => set({ workspaces: ws }),
  setCurrent: (id) => {
    localStorage.setItem("currentWorkspaceId", id);
    set({ currentId: id });
  },
  fetchWorkspaces: async () => {
    set({ isLoading: true });
    try {
      const data = await api.workspaces.list();
      set({ workspaces: data.workspaces || [] });
      if (data.workspaces?.length && !get().currentId) {
        get().setCurrent(data.workspaces[0].id);
      }
    } catch (err) {
      console.error("[Workspace] fetch failed:", err);
      if (import.meta.env.DEV) {
        const demo = [{ id: "ws-1", name: "默认空间", icon: "🏠", description: "默认工作空间" }];
        set({ workspaces: demo, currentId: "ws-1" });
      }
    } finally {
      set({ isLoading: false });
    }
  },
  createWorkspace: async (data) => {
    const res = await api.workspaces.create(data);
    set({ workspaces: [...get().workspaces, res] });
    get().setCurrent(res.id);
  },
  switchWorkspace: async (id) => {
    await api.workspaces.switch(id);
    get().setCurrent(id);
  },
}));
