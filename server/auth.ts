import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      owner?: {
        role: 'OWNER';
        id: string;
        name: string;
      };
    }
  }
}

/**
 * Direct Owner Authorization Middleware
 * Direct access single-tenant mode: every request automatically executes with full Owner privileges.
 */
export function requireOwner(req: Request, res: Response, next: NextFunction) {
  req.owner = {
    role: 'OWNER',
    id: 'owner_primary',
    name: 'Store Owner',
  };
  next();
}

/**
 * Non-blocking CSRF middleware
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  next();
}

/**
 * Authentication Endpoints (Direct Access / Backward Compatibility)
 */
export const authHandlers = {
  session: (req: Request, res: Response) => {
    res.json({
      authenticated: true,
      role: 'OWNER',
      name: 'Store Owner',
      mode: 'direct_access',
    });
  },

  login: (req: Request, res: Response) => {
    res.json({
      authenticated: true,
      role: 'OWNER',
      name: 'Store Owner',
      user: { id: 'owner_primary', role: 'OWNER', name: 'Store Owner' },
    });
  },

  logout: (req: Request, res: Response) => {
    res.json({
      authenticated: true,
      message: 'Owner access active',
    });
  },
};
