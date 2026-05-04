import KanbanBoard from "@/components/KanbanBoard";
import { useTaskStore } from "@/stores/taskStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { Plus, Filter } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Dashboard() {
  const { workspaces, currentId } = useWorkspaceStore();
  const { createTask } = useTaskStore();
  const current = workspaces.find((w) => w.id === currentId);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("p2");
  const [newTaskType, setNewTaskType] = useState("human_task");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return;
    setIsCreating(true);
    try {
      await createTask({
        title: newTaskTitle.trim(),
        description: newTaskDesc.trim(),
        priority: newTaskPriority,
        type: newTaskType,
        status: "backlog",
      });
      setNewTaskTitle("");
      setNewTaskDesc("");
      setNewTaskPriority("p2");
      setNewTaskType("human_task");
      setShowNewTask(false);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-800">
            {current?.icon || "📋"} {current?.name || "看板"}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {current?.description || "拖拽卡片变更状态"}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50 transition-colors">
            <Filter size={14} />
            筛选
          </button>
          <button
            onClick={() => setShowNewTask(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <Plus size={14} />
            新建任务
          </button>
        </div>
      </div>

      <div className="flex-1">
        <KanbanBoard />
      </div>

      <Dialog open={showNewTask} onOpenChange={setShowNewTask}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建任务</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="任务标题"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleCreateTask()}
            />
            <Input
              placeholder="任务描述（可选）"
              value={newTaskDesc}
              onChange={(e) => setNewTaskDesc(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">优先级</label>
                <Select value={newTaskPriority} onValueChange={setNewTaskPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="p0">P0 紧急</SelectItem>
                    <SelectItem value="p1">P1 高</SelectItem>
                    <SelectItem value="p2">P2 中</SelectItem>
                    <SelectItem value="p3">P3 低</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">类型</label>
                <Select value={newTaskType} onValueChange={setNewTaskType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="human_task">人工任务</SelectItem>
                    <SelectItem value="ai_task">AI 任务</SelectItem>
                    <SelectItem value="mixed">协作任务</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNewTask(false)} disabled={isCreating}>
                取消
              </Button>
              <Button onClick={handleCreateTask} disabled={!newTaskTitle.trim() || isCreating}>
                {isCreating ? "创建中..." : "创建"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
