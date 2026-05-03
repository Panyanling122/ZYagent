import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request { user?: any; }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) { res.status(401).json({ error: "Missing token" }); return; }
  const token = header.replace("Bearer ", "");
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch { res.status(401).json({ error: "Invalid token" }); }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.adminId) { res.status(403).json({ error: "Admin only" }); return; }
  next();
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.userId && !req.user?.adminId) { res.status(403).json({ error: "User only" }); return; }
  next();
}

export const authMiddleware = authenticateToken;
export const ipWhitelistMiddleware = (_req: Request, _res: Response, next: NextFunction) => next();
