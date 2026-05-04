import { useState } from "react";
import { FileText, FileSpreadsheet, Presentation, FilePlus, Upload, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLocalFiles } from "@/hooks/useLocalFiles";
import { toast } from "sonner";

const docTypes = [
  { id: "ppt", label: "PPT 演示文稿", icon: Presentation, color: "bg-orange-100 text-orange-600" },
  { id: "excel", label: "Excel 数据表格", icon: FileSpreadsheet, color: "bg-green-100 text-green-600" },
  { id: "word", label: "Word 文档", icon: FileText, color: "bg-blue-100 text-blue-600" },
];

export default function DocumentPage() {
  const [showNew, setShowNew] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const { writeFile, openFile, isTauri } = useLocalFiles();
  const [recentFiles, setRecentFiles] = useState([
    { name: "Q3销售报表.xlsx", type: "excel", date: "2026-05-04", size: "45KB" },
    { name: "产品介绍.pptx", type: "ppt", date: "2026-05-03", size: "2.1MB" },
    { name: "会议纪要.docx", type: "word", date: "2026-05-02", size: "12KB" },
  ]);

  const handleCreate = async () => {
    if (!selectedType) return;
    const names: Record<string, string> = { ppt: "新建演示.pptx", excel: "新建表格.xlsx", word: "新建文档.docx" };
    const name = names[selectedType];
    if (isTauri) {
      await writeFile(name, "Placeholder content");
      setRecentFiles([{ name, type: selectedType, date: new Date().toISOString().slice(0, 10), size: "1KB" }, ...recentFiles]);
      toast.success(`文件已保存到 ~/OpenClaw/${name}`);
    } else {
      await writeFile(name, "Placeholder content");
      toast.info("文件已触发浏览器下载");
    }
    setShowNew(false);
  };

  return (
    <div className="h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-800">📄 文档中心</h2>
          <p className="text-xs text-gray-500 mt-0.5">AI 生成与本地文件管理 {isTauri ? "(Tauri 模式)" : "(Web 模式)"}</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50">
            <Upload size={14} />
            导入文件
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <FilePlus size={14} />
            新建文档
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {docTypes.map((t) => (
          <button
            key={t.id}
            onClick={() => { setSelectedType(t.id); setShowNew(true); }}
            className="flex flex-col items-center gap-3 p-6 rounded-xl border hover:border-blue-300 hover:shadow-md transition-all bg-white"
          >
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${t.color}`}>
              <t.icon size={28} />
            </div>
            <span className="font-medium text-sm text-gray-700">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">📁 最近文件</h3>
          <span className="text-xs text-gray-400">{isTauri ? "存储于 ~/OpenClaw/" : "浏览器下载"}</span>
        </div>
        <div className="divide-y">
          {recentFiles.map((f) => (
            <div key={f.name} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                {f.type === "ppt" && <Presentation size={18} className="text-orange-500" />}
                {f.type === "excel" && <FileSpreadsheet size={18} className="text-green-500" />}
                {f.type === "word" && <FileText size={18} className="text-blue-500" />}
                <div>
                  <p className="text-sm font-medium text-gray-800">{f.name}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-2">
                    <Clock size={10} />
                    {f.date} · {f.size}
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                {isTauri && (
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => openFile(f.name)}>
                    打开
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="text-xs h-7">分析</Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建文档</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {docTypes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedType(t.id)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors ${
                    selectedType === t.id ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"
                  }`}
                >
                  <t.icon size={24} />
                  <span className="text-xs">{t.label.split(" ")[0]}</span>
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="文档描述（AI 将根据描述生成内容）"
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowNew(false)}>取消</Button>
              <Button size="sm" onClick={handleCreate} disabled={!selectedType}>创建</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
