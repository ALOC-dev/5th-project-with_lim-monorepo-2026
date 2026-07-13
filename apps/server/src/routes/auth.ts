import { Router } from 'express';
import { z } from 'zod';
import { createApiError, createApiResponse } from '@monorepo/api-contracts';
import { db } from '../db/client.js';
import { eq, or } from 'drizzle-orm';
import { users } from '../db/schema.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = Router();

const SignupSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    nickname: z.string().min(1),
});

const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
});


router.post('/signup', async(req, res) => {
    const parsed = SignupSchema.safeParse(req.body);
    if(!parsed.success) {
        res.status(400).json(createApiError('invalid input'));
        return;
    }

    const existing = await db.select()
    .from(users)
    .where(or(eq(users.email, parsed.data.email),
        eq(users.nickname, parsed.data.nickname),
    ));


    if(existing.some(u => u.email === parsed.data.email)){
    res.status(409).json(createApiError('email already exists'));
    return;
    }

    if(existing.some(u => u.nickname === parsed.data.nickname)) {
    res.status(409).json(createApiError('nickname already exists'));
    return;
    }


    const passwordHash = await bcrypt.hash(parsed.data.password, 10);

    const [newUser] = await db.insert(users).values({
        email: parsed.data.email,
        passwordHash,
        nickname: parsed.data.nickname,
    }).returning();

if (!newUser) {
    res.status(500).json(createApiError('failed to create user'));
    return;
}

    const token = jwt.sign(
        { userId: newUser.id },
        process.env.JWT_SECRET!,
        { expiresIn: '7d'}
    );

    res.cookie('token', token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
    });

    res.status(201).json(createApiResponse({
        user: {
        id: newUser.id,
        email: newUser.email,
        nickname: newUser.nickname,
    },
}));

});

router.post('/login', async(req, res) => {
    const parsed = LoginSchema.safeParse(req.body);
    if(!parsed.success) {
        res.status(400).json(createApiError('invalid input'));
        return;
    }

    const [user] = await db.select()
        .from(users)
        .where(eq(users.email, parsed.data.email));

    if (!user) {
        res.status(401).json(createApiError('invalid credentials'));
        return;
    }

    const passwordMatches = await bcrypt.compare(parsed.data.password, user.passwordHash);

    if (!passwordMatches) {
        res.status(401).json(createApiError('invalid credentials'));
        return;
    }

    const token = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
);

res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
});

res.status(200).json(createApiResponse({
    user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
    },
}));



    });

router.post('/logout', (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
    });

    res.status(200).json(createApiResponse({ success: true }));
});


export default router;
