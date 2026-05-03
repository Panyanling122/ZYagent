"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const task_service_1 = require("../services/task-service");
const router = express.Router();
const service = task_service_1.TaskService.getInstance();

function getUserId(req) { return req.user?.id || req.headers["x-user-id"]; }
function getWorkspaceId(req) { 
    const val = req.headers["x-workspace-id"] || req.body?.workspace_id;
    if (val && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) return null;
    return val;
}

router.get("/tasks", async (req, res) => {
    try {
        const workspaceId = getWorkspaceId(req);
        if (!workspaceId) return res.status(400).json({ error: "workspace_id required" });
        const tasks = await service.list(workspaceId, req.query);
        res.json({ tasks });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/tasks", async (req, res) => {
    try {
        const userId = getUserId(req);
        const workspaceId = getWorkspaceId(req);
        if (!userId || !workspaceId) return res.status(400).json({ error: "user_id and workspace_id required" });
        const task = await service.create({ ...req.body, created_by: userId, workspace_id: workspaceId });
        res.status(201).json(task);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/tasks/:id", async (req, res) => {
    try {
        const workspaceId = getWorkspaceId(req);
        const task = await service.getById(req.params.id, workspaceId);
        if (!task) return res.status(404).json({ error: "Task not found" });
        const comments = await service.getComments(req.params.id);
        const history = await service.getHistory(req.params.id);
        res.json({ ...task, comments, history });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/tasks/:id/status", async (req, res) => {
    try {
        const userId = getUserId(req);
        const workspaceId = getWorkspaceId(req);
        const { status, reason } = req.body;
        if (!status) return res.status(400).json({ error: "status required" });
        const task = await service.updateStatus(req.params.id, workspaceId, status, userId, reason);
        res.json(task);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

router.patch("/tasks/:id/status", async (req, res) => {
    try {
        const userId = getUserId(req);
        const workspaceId = getWorkspaceId(req);
        const { status, reason } = req.body;
        if (!status) return res.status(400).json({ error: "status required" });
        const task = await service.updateStatus(req.params.id, workspaceId, status, userId, reason);
        res.json(task);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put("/tasks/:id", async (req, res) => {
    try {
        const workspaceId = getWorkspaceId(req);
        const { title, description, priority, type, soul_id, topic, channel } = req.body;
        const db = require("../utils/db").Database.getInstance();
        const result = await db.query(
            `UPDATE tasks SET title = COALESCE($1, title), description = COALESCE($2, description),
             priority = COALESCE($3, priority), type = COALESCE($4, type), soul_id = COALESCE($5, soul_id),
             topic = COALESCE($6, topic), channel = COALESCE($7, channel), updated_at = NOW()
             WHERE id = $8 AND workspace_id = $9 RETURNING *`,
            [title, description, priority, type, soul_id, topic, channel, req.params.id, workspaceId]
        );
        if (!result.rows[0]) return res.status(404).json({ error: "Task not found" });
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/tasks/:id/assign", async (req, res) => {
    try {
        const userId = getUserId(req);
        const workspaceId = getWorkspaceId(req);
        const { assigned_to, assigned_type } = req.body;
        const db = require("../utils/db").Database.getInstance();
        const result = await db.query(
            `UPDATE tasks SET assigned_to = $1, updated_at = NOW() WHERE id = $2 AND workspace_id = $3 RETURNING *`,
            [assigned_to, req.params.id, workspaceId]
        );
        if (!result.rows[0]) return res.status(404).json({ error: "Task not found" });
        await db.query(
            `INSERT INTO task_history (task_id, from_status, to_status, changed_by, reason, created_at) VALUES ($1, $2, $3, $4, $5, NOW())`,
            [req.params.id, result.rows[0].status, result.rows[0].status, userId, `Assigned to ${assigned_type || 'user'}: ${assigned_to}`]
        );
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/tasks/:id/comments", async (req, res) => {
    try {
        const userId = getUserId(req);
        const workspaceId = getWorkspaceId(req);
        const { content } = req.body;
        if (!content) return res.status(400).json({ error: "content required" });
        await service.addComment(req.params.id, workspaceId, 'human', userId, content);
        res.status(201).json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/tasks/:id", async (req, res) => {
    try {
        const workspaceId = getWorkspaceId(req);
        await service.delete(req.params.id, workspaceId);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

exports.default = router;
