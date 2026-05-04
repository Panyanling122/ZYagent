import { useChatStore } from "@/stores/chatStore";
import { useState, useRef, useEffect, useCallback, memo } from "react";
import { MessageSquare, X, Minus, Send, Paperclip } from "lucide-react";
import AwaitHumanCard from "./AwaitHumanCard";

const MessageBubble = memo(function MessageBubble({ msg }: { msg: ReturnType<typeof useChatStore.getState>['messages'][0] }) {
  if (msg.awaitingHuman) {
    return (
      <div className="space-y-2">
        <div className="bg-gray-100 text-gray-800 rounded-lg px-3 py-2 text-sm max-w-[85%]">
          {msg.content}
        </div>
        <AwaitHumanCard
          taskId={msg.awaitingHuman.taskId}
          question={msg.awaitingHuman.question}
          options={msg.awaitingHuman.options}
        />
      </div>
    );
  }
  return (
    <div
      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
        msg.role === "user" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-800"
      }`}
    >
      {msg.content}
    </div>
  );
});

export default function ChatPanel() {
  const { messages, isMinimized, unread, togglePanel, minimize, sendViaWS } = useChatStore();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    sendViaWS(input.trim());
    setInput("");
  }, [input, sendViaWS]);

  if (isMinimized) {
    return (
      <button
        onClick={togglePanel}
        className="fixed right-4 bottom-4 w-12 h-12 bg-blue-600 rounded-full shadow-lg flex items-center justify-center text-white hover:bg-blue-700 transition-colors z-50"
      >
        <MessageSquare size={20} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="w-96 bg-white border-l flex flex-col shrink-0 h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <h3 className="font-semibold text-sm">💬 对话</h3>
        <div className="flex gap-1">
          <button onClick={minimize} className="p-1 hover:bg-gray-100 rounded">
            <Minus size={14} />
          </button>
          <button onClick={togglePanel} className="p-1 hover:bg-gray-100 rounded">
            <X size={14} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-10">
            <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
            开始与智能体对话
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <MessageBubble msg={msg} />
          </div>
        ))}
      </div>

      <div className="border-t p-2">
        <div className="flex items-center gap-2">
          <button className="p-1.5 text-gray-400 hover:text-gray-600">
            <Paperclip size={16} />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="输入消息..."
            className="flex-1 text-sm px-3 py-1.5 border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleSend}
            className="p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
