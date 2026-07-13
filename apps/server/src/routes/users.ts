import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createApiError, createApiResponse } from '@monorepo/api-contracts';
import { requireAuth } from '../middleware/auth.js';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';

const router = Router();

const UpdateMeSchema = z.object({
    nickname: z.string().min(1),
});

router.get('/me', requireAuth, async (req, res) => {
    const [user] = await db.select().from(users).where(eq(users.id, req.userId));

    if (!user) {
        res.status(404).json(createApiError('not found'));
        return;
    }

    res.status(200).json(createApiResponse({
        user: {
            id: user.id,
            email: user.email,
            nickname: user.nickname,
        },
    }));
});

router.patch('/me', requireAuth, async (req, res) => {
    const parsed = UpdateMeSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(createApiError('invalid input'));
        return;
    }

    const [existing] = await db.select().from(users).where(eq(users.nickname, parsed.data.nickname));
    if (existing && existing.id !== req.userId) {
        res.status(409).json(createApiError('nickname already exists'));
        return;
    }

    const [updated] = await db.update(users)
        .set({ nickname: parsed.data.nickname })
        .where(eq(users.id, req.userId))
        .returning();

    if (!updated) {
        res.status(404).json(createApiError('not found'));
        return;
    }

    res.status(200).json(createApiResponse({
        user: {
            id: updated.id,
            email: updated.email,
            nickname: updated.nickname,
        },
    }));
});

router.delete('/me', requireAuth, async (req, res) => {
    await db.delete(users).where(eq(users.id, req.userId));

    res.clearCookie('token', {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
    });

    res.status(200).json(createApiResponse({ success: true }));
});

export default router;
