import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'annapurna_super_secret_jwt_key_123!';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    mobile_number: string;
    role: string;
  };
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Bypass validation and assign a mock operator identity
  req.user = {
    id: 1,
    mobile_number: '9999999999',
    role: 'operator'
  };
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
