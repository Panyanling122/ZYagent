import { useEffect, useRef, useCallback } from "react";
import { useChatStore, setGlobalWS } from "@/stores/chatStore";
import { useTaskStore } from "@/stores/taskStore";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:3003/ws";

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef(0);
  const connectingRef = useRef(false);

  // Keep latest store actions in refs to avoid dependency churn
  const chatActionsRef = useRef(useChatStore.getState());
  const taskActionsRef = useRef(useTaskStore.getState());

  useEffect(() => {
    const unsubChat = useChatStore.subscribe((s) => { chatActionsRef.current = s; });
    const unsubTask = useTaskStore.subscribe((s) => { taskActionsRef.current = s; });
    return () => { unsubChat(); unsubTask(); };
  }, []);

  const handleMessage = useCallback((msg: any) => {
    const { addMessage, togglePanel } = chatActionsRef.current;
    const { addTask, fetchTasks } = taskActionsRef.current;

    switch (msg.type) {
      case "reply": {
        addMessage({
          id: `ws-${Date.now()}`,
          role: "assistant",
          content: msg.content,
          topic: msg.topic,
          timestamp: new Date().toISOString(),
        });
        if (msg.content && msg.content.includes("🟡")) {
          togglePanel();
        }
        break;
      }
      case "task_created": {
        addTask(msg.task);
        break;
      }
      case "task_status_changed": {
        const wsId = localStorage.getItem("currentWorkspaceId");
        if (wsId) fetchTasks(wsId);
        break;
      }
      case "task_awaiting_human": {
        addMessage({
          id: `ws-ah-${Date.now()}`,
          role: "assistant",
          content: `🟡 任务挂起：${msg.message}`,
          timestamp: new Date().toISOString(),
        });
        togglePanel();
        break;
      }
      case "task_remind": {
        if (typeof window !== "undefined" && (window as any).__TAURI__) {
          // @ts-ignore
          (window as any).__TAURI__.invoke("show_notification", {
            title: "OpenClaw 提醒",
            body: msg.message || msg.title,
          });
        }
        break;
      }
      case "auth_success": {
        localStorage.setItem("userId", msg.userId);
        if (msg.workspaceId) {
          localStorage.setItem("currentWorkspaceId", msg.workspaceId);
        }
        break;
      }
    }
  }, []);

  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (connectingRef.current || wsRef.current?.readyState === WebSocket.OPEN) return;
    connectingRef.current = true;

    const token = localStorage.getItem("token") || "demo-token";
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    setGlobalWS(ws);

    ws.onopen = () => {
      connectingRef.current = false;
      reconnectRef.current = 0;
      ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch {
        console.error("[WS] Invalid message:", event.data);
      }
    };

    ws.onclose = () => {
      connectingRef.current = false;
      wsRef.current = null;
      setGlobalWS(null);
      if (reconnectRef.current > 20) {
        console.error("[WS] Max reconnection attempts reached");
        return;
      }
      const delay = Math.min(30000, 1000 * Math.pow(2, reconnectRef.current));
      reconnectRef.current++;
      setTimeout(() => connectRef.current(), delay);
    };

    ws.onerror = (err) => {
      console.error("[WS] Error:", err);
    };
  }, [handleMessage]);

  connectRef.current = connect;

  useEffect(() => {
    const timer = setTimeout(() => connectRef.current(), 0);
    return () => {
      clearTimeout(timer);
      wsRef.current?.close();
      setGlobalWS(null);
    };
  }, []);

  return { ws: wsRef };
}
