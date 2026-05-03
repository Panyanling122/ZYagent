"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ipWhitelistMiddleware = exports.authMiddleware = void 0;
exports.authenticateToken = authenticateToken;
exports.requireAdmin = requireAdmin;
exports.requireUser = requireUser;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
function authenticateToken(req, res, next) {
    const header = req.headers.authorization;
    if (!header) {
        res.status(401).json({ error: "Missing token" });
        return;
    }
    const token = header.replace("Bearer ", "");
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch {
        res.status(401).json({ error: "Invalid token" });
    }
}
function requireAdmin(req, res, next) {
    if (!req.user?.adminId) {
        res.status(403).json({ error: "Admin only" });
        return;
    }
    next();
}
function requireUser(req, res, next) {
    if (!req.user?.userId && !req.user?.adminId) {
        res.status(403).json({ error: "User only" });
        return;
    }
    next();
}
exports.authMiddleware = authenticateToken;
const ipWhitelistMiddleware = (_req, _res, next) => next();
exports.ipWhitelistMiddleware = ipWhitelistMiddleware;
