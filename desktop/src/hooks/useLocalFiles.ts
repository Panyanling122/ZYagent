import { useCallback } from "react";

function getIsTauri(): boolean {
  return typeof window !== "undefined" && !!(window as any).__TAURI__;
}

export function useLocalFiles() {
  const writeFile = useCallback(async (path: string, content: string) => {
    if (getIsTauri()) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke("write_local_file", { path, content });
    }
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = path.split("/").pop() || "file";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const readFile = useCallback(async (path: string): Promise<string> => {
    if (getIsTauri()) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke("read_local_file", { path });
    }
    return "";
  }, []);

  const openFile = useCallback(async (path: string) => {
    if (getIsTauri()) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke("open_with_default_app", { path });
    }
  }, []);

  const getFiles = useCallback(async (dir: string): Promise<string[]> => {
    if (getIsTauri()) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke("get_local_files", { dir });
    }
    return [];
  }, []);

  const notify = useCallback(async (title: string, body: string) => {
    if (getIsTauri()) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke("show_notification", { title, body });
    }
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    }
  }, []);

  return { writeFile, readFile, openFile, getFiles, notify, isTauri: getIsTauri() };
}
