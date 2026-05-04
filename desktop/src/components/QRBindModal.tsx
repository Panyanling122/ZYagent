import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEffect, useState, useRef, useCallback } from "react";
import { useAuthStore } from "@/stores/authStore";
import { api } from "@/api/client";
import { Copy, Check, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

function genHexToken(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function QRBindModal({ open, onClose }: Props) {
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(600);
  const [bindStatus, setBindStatus] = useState<"pending" | "bound" | "expired">("pending");
  const [isCreating, setIsCreating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCloseRef = useRef(onClose);
  const { setBound, setSkipped } = useAuthStore();

  onCloseRef.current = onClose;

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => {
    if (!open) {
      cleanup();
      return;
    }
    setIsCreating(true);
    setBindStatus("pending");
    setTimeLeft(600);

    api.ilink.createBindToken()
      .then((res) => {
        const tk = res.token || genHexToken();
        setToken(tk);
        setTimeLeft(res.expiresIn || 600);
        setIsCreating(false);

        timerRef.current = setInterval(() => {
          setTimeLeft((t) => {
            if (t <= 1) {
              cleanup();
              setBindStatus("expired");
              return 0;
            }
            return t - 1;
          });
        }, 1000);

        pollRef.current = setInterval(async () => {
          try {
            const status = await api.ilink.checkBindStatus(tk);
            if (status.status === "bound") {
              cleanup();
              setBindStatus("bound");
              setBound(true);
              setTimeout(() => onCloseRef.current(), 1500);
            }
          } catch {
            // ignore poll errors
          }
        }, 3000);
      })
      .catch(() => {
        setIsCreating(false);
        const tk = genHexToken();
        setToken(tk);
        setTimeLeft(600);
      });

    return cleanup;
  }, [open, setBound, cleanup]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`绑定OpenClaw:${token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSkip = () => {
    cleanup();
    setSkipped();
    onCloseRef.current();
  };

  const statusText = {
    pending: "等待微信扫描...",
    bound: "✅ 绑定成功！",
    expired: "⏰ 绑定口令已过期",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleSkip()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">📱 绑定微信账号</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isCreating ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin mr-2" size={20} />
              <span className="text-sm text-gray-500">生成绑定口令...</span>
            </div>
          ) : (
            <>
              <div className="bg-gray-100 rounded-lg p-6 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-48 h-48 bg-white rounded-lg mx-auto mb-3 flex items-center justify-center border-2 border-dashed border-gray-300">
                    <div className="text-center">
                      <div className="text-4xl mb-2">📷</div>
                      <div className="text-xs text-gray-500 font-mono">{token.slice(0, 16)}...</div>
                    </div>
                  </div>
                  <p className={`text-sm font-medium ${bindStatus === "bound" ? "text-green-600" : bindStatus === "expired" ? "text-red-500" : "text-blue-600"}`}>
                    {statusText[bindStatus]}
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm text-gray-600">
                <p>1. 打开微信，进入 ClawBot 聊天窗口</p>
                <p>2. 发送消息：绑定OpenClaw:{token.slice(0, 16)}...</p>
                <p>3. 收到确认回复即完成绑定</p>
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={handleCopy}
                  disabled={bindStatus !== "pending"}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                  复制绑定口令
                </button>
                <span className={`text-sm ${timeLeft < 60 ? "text-red-500" : "text-gray-500"}`}>
                  ⏱ {formatTime(timeLeft)}
                </span>
              </div>
            </>
          )}

          <button
            onClick={handleSkip}
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            稍后再说
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
