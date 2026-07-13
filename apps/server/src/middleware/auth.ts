import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { createApiError } from '@monorepo/api-contracts';

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.token;

    if (!token) {
        res.status(401).json(createApiError('unauthorized'));
        return;
    }

    try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    req.userId = payload.userId;
    next();
} catch {
    res.status(401).json(createApiError('unauthorized'));
    return;
}

};
