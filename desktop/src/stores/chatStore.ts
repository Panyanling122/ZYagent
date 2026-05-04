import { create } from "zustand";
import { api } from "@/api/client";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  topic?: string;
  timestamp: string;
  awaitingHuman?: { taskId: string; question: string; options?: string[] };
}

let globalWs: WebSocket | null = null;
export function setGlobalWS(ws: WebSocket | null) { globalWs = ws; }

interface ChatState {
  messages: ChatMessage[];
  isMinimized: boolean;
  unread: number;
  addMessage: (msg: ChatMessage) => void;
  togglePanel: () => void;
  minimize: () => void;
  markRead: () => void;
  sendMessage: (content: string) => Promise<void>;
  sendViaWS: (content: string) => void;
  respondToTask: (taskId: string, response: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isMinimized: true,
  unread: 0,
  addMessage: (msg) => {
    set({ messages: [...get().messages, msg] });
    if (msg.role === "assistant" && get().isMinimized) {
      set({ unread: get().unread + 1 });
    }
  },
  togglePanel: () => set((s) => ({ isMinimized: !s.isMinimized, unread: s.isMinimized ? 0 : s.unread })),
  minimize: () => set({ isMinimized: true }),
  markRead: () => set({ unread: 0 }),
  sendMessage: async (content: string) => {
    const msg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    set({ messages: [...get().messages, msg] });
  },
  sendViaWS: (content: string) => {
    if (globalWs && globalWs.readyState === WebSocket.OPEN) {
      const soulId = localStorage.getItem("subscribedSoulId") || "";
      globalWs.send(JSON.stringify({ type: "message", content, soulId }));
    }
    const msg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    set({ messages: [...get().messages, msg], isMinimized: false });
  },
  respondToTask: async (taskId, response) => {
    try {
      const valueMap: Record<string, string> = { "同意": "approve", "拒绝": "reject", "修改": "modify" };
      const machineValue = valueMap[response] || response;
      await api.tasks.updateStatus(taskId, "in_progress", `Human ${machineValue}`);
      const msg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: `已${response}，任务已恢复进行`,
        timestamp: new Date().toISOString(),
      };
      set({ messages: [...get().messages, msg] });
    } catch (e) {
      console.error("Respond to task failed:", e);
    }
  },
}));
