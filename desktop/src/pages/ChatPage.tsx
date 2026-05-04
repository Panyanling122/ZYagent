import { useChatStore } from "@/stores/chatStore";
import { useState, useRef, useEffect } from "react";
import { Send, Paperclip, Bot, User } from "lucide-react";

export default function ChatPage() {
  const { messages, sendViaWS } = useChatStore();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendViaWS(input.trim());
    setInput("");
  };

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b">
        <Bot size={20} className="text-blue-600" />
        <h2 className="font-bold text-gray-800">与智能体对话</h2>
        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">在线</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-20">
            <Bot size={48} className="mx-auto mb-3 opacity-20" />
            <p className="text-lg font-medium mb-1">OpenClaw 智能体</p>
            <p className="text-sm">发送消息开始对话，智能体将自动处理您的任务</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              msg.role === "user" ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-600"
            }`}>
              {msg.role === "user" ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div className={`max-w-[75%] rounded-lg px-4 py-2.5 text-sm ${
              msg.role === "user"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-800"
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t pt-3">
        <div className="flex items-center gap-2">
          <button className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
            <Paperclip size={18} />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="输入消息..."
            className="flex-1 px-4 py-2.5 border rounded-full text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleSend}
            className="p-2.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
