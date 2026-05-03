"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const workspace_service_1 = require("../services/workspace-service");
const router = express.Router();
const service = workspace_service_1.WorkspaceService.getInstance();

function validateUUID(val) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

router.get("/workspaces", async (req, res) => {
    try {
        const userId = req.user?.id || req.headers["x-user-id"];
        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        const list = await service.listForUser(userId);
        res.json({ workspaces: list });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/workspaces", async (req, res) => {
    try {
        const userId = req.user?.id || req.headers["x-user-id"];
        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        const { name, description, icon } = req.body;
        if (!name) return res.status(400).json({ error: "name required" });
        const ws = await service.create(userId, name, description, icon);
        res.status(201).json(ws);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/workspaces/:id", async (req, res) => {
    try {
        const userId = req.user?.id || req.headers["x-user-id"];
        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        if (!validateUUID(req.params.id)) return res.status(400).json({ error: "Invalid workspace ID" });
        const ws = await service.getById(req.params.id, userId);
        if (!ws) return res.status(404).json({ error: "Not found" });
        const souls = await service.getSouls(req.params.id);
        res.json({ ...ws, souls });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/workspaces/:id", async (req, res) => {
    try {
        const userId = req.user?.id || req.headers["x-user-id"];
        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        if (!validateUUID(req.params.id)) return res.status(400).json({ error: "Invalid workspace ID" });
        const ws = await service.getById(req.params.id, userId);
        if (!ws) return res.status(404).json({ error: "Not found" });
        const { name, description, icon } = req.body;
        const db = require("../utils/db").Database.getInstance();
        const result = await db.query(
            `UPDATE workspaces SET name = COALESCE($1, name), description = COALESCE($2, description), icon = COALESCE($3, icon), updated_at = NOW() WHERE id = $4 RETURNING *`,
            [name, description, icon, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/workspaces/:id", async (req, res) => {
    try {
        const userId = req.user?.id || req.headers["x-user-id"];
        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        if (!validateUUID(req.params.id)) return res.status(400).json({ error: "Invalid workspace ID" });
        await service.delete(req.params.id, userId);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/workspaces/:id/switch", async (req, res) => {
    try {
        const userId = req.user?.id || req.headers["x-user-id"];
        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        if (!validateUUID(req.params.id)) return res.status(400).json({ error: "Invalid workspace ID" });
        const ws = await service.getById(req.params.id, userId);
        if (!ws) return res.status(404).json({ error: "Not found" });
        res.json({ success: true, workspace: ws, switched: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

exports.default = router;
