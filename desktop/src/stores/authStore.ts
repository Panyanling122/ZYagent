import { create } from "zustand";

interface AuthState {
  userId: string | null;
  token: string | null;
  isBound: boolean;
  checkBound: () => Promise<boolean>;
  setBound: (v: boolean) => void;
  setSkipped: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: localStorage.getItem("userId"),
  token: localStorage.getItem("token"),
  isBound: false,
  checkBound: async () => {
    const skipped = localStorage.getItem("wechatBindSkipped") === "true";
    if (skipped) {
      set({ isBound: true });
      return true;
    }
    const bound = localStorage.getItem("wechatBound") === "true";
    set({ isBound: bound });
    return bound;
  },
  setBound: (v) => {
    localStorage.setItem("wechatBound", String(v));
    set({ isBound: v });
  },
  setSkipped: () => {
    localStorage.setItem("wechatBindSkipped", "true");
    set({ isBound: true });
  },
}));
