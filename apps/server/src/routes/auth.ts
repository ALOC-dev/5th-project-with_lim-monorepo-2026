import { Router } from 'express';
import { z } from 'zod';
import { createApiError, createApiResponse } from '@monorepo/api-contracts';
import { db } from '../db/client.js';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { emailVerifications, passwordResetTokens, users } from '../db/schema.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../middleware/auth.js';
import { generateToken, hashToken } from '../lib/tokens.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../lib/resend.js';

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

const ForgotPasswordSchema = z.object({
    email: z.string().email(),
});

const ResetPasswordSchema = z.object({
    token: z.string().min(1),
    newPassword: z.string().min(8),
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

    try {
        const verifyToken = generateToken();
        await db.insert(emailVerifications).values({
            userId: newUser.id,
            tokenHash: hashToken(verifyToken),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
        await sendVerificationEmail(newUser.email, verifyToken);
    } catch (err) {
        console.error('failed to send verification email', err);
    }
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

router.get('/verify-email', async (req, res) => {
    const token = req.query.token;
    if (typeof token !== 'string') {
        res.status(400).json(createApiError('invalid token'));
        return;
    }

    const [record] = await db.select()
        .from(emailVerifications)
        .where(and(
            eq(emailVerifications.tokenHash, hashToken(token)),
            isNull(emailVerifications.usedAt),
            gt(emailVerifications.expiresAt, new Date()),
        ));

    if (!record) {
        res.status(400).json(createApiError('invalid or expired token'));
        return;
    }

    await db.update(emailVerifications)
        .set({ usedAt: new Date() })
        .where(eq(emailVerifications.id, record.id));

    await db.update(users)
        .set({ emailVerified: true })
        .where(eq(users.id, record.userId));

    res.status(200).json(createApiResponse({ verified: true }));
});

router.post('/verify-email/resend', requireAuth, async (req, res) => {
    const [user] = await db.select().from(users).where(eq(users.id, req.userId));

    if (!user) {
        res.status(404).json(createApiError('not found'));
        return;
    }

    if (user.emailVerified) {
        res.status(200).json(createApiResponse({ alreadyVerified: true }));
        return;
    }

    const verifyToken = generateToken();
    await db.insert(emailVerifications).values({
        userId: user.id,
        tokenHash: hashToken(verifyToken),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    try {
        await sendVerificationEmail(user.email, verifyToken);
    } catch (err) {
        console.error('failed to send verification email', err);
        res.status(500).json(createApiError('failed to send email'));
        return;
    }

    res.status(200).json(createApiResponse({ sent: true }));
});

router.post('/forgot-password', async (req, res) => {
    const parsed = ForgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(createApiError('invalid input'));
        return;
    }

    const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email));

    // 이메일 존재 여부와 무관하게 항상 같은 응답 (계정 존재 여부 스캔 방지)
    if (user) {
        const resetToken = generateToken();
        await db.insert(passwordResetTokens).values({
            userId: user.id,
            tokenHash: hashToken(resetToken),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        });

        try {
            await sendPasswordResetEmail(user.email, resetToken);
        } catch (err) {
            console.error('failed to send password reset email', err);
        }
    }

    res.status(200).json(createApiResponse({ sent: true }));
});

router.post('/reset-password', async (req, res) => {
    const parsed = ResetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(createApiError('invalid input'));
        return;
    }

    const [record] = await db.select()
        .from(passwordResetTokens)
        .where(and(
            eq(passwordResetTokens.tokenHash, hashToken(parsed.data.token)),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, new Date()),
        ));

    if (!record) {
        res.status(400).json(createApiError('invalid or expired token'));
        return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);

    await db.update(users)
        .set({ passwordHash })
        .where(eq(users.id, record.userId));

    await db.update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, record.id));

    res.status(200).json(createApiResponse({ reset: true }));
});


export default router;