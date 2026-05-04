import { useChatStore } from "@/stores/chatStore";
import { AlertTriangle } from "lucide-react";

interface Props {
  taskId: string;
  question: string;
  options?: string[];
}

export default function AwaitHumanCard({ taskId, question, options = ["同意", "拒绝", "修改"] }: Props) {
  const { respondToTask } = useChatStore();

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 my-2">
      <div className="flex items-start gap-2 mb-2">
        <AlertTriangle size={14} className="text-yellow-500 shrink-0 mt-0.5" />
        <span className="text-sm font-medium text-yellow-800">🟡 等待确认 #{taskId.slice(0, 6)}</span>
      </div>
      <p className="text-sm text-yellow-700 mb-2">{question}</p>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => respondToTask(taskId, opt)}
            className="px-3 py-1 text-xs font-medium rounded-md border border-yellow-300 bg-white hover:bg-yellow-100 text-yellow-800 transition-colors"
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
