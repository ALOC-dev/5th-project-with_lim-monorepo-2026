import { z } from "zod";

export const AuthenticatedUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  nickname: z.string().min(1),
});

export type AuthenticatedUser = z.infer<typeof AuthenticatedUserSchema>;

export const SignupRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  nickname: z.string().min(1),
});

export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const ForgotPasswordRequestSchema = z.object({
  email: z.email(),
});

export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

export const ResetPasswordRequestSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export const VerifyEmailQuerySchema = z.object({
  token: z.string().min(1),
});

export type VerifyEmailQuery = z.infer<typeof VerifyEmailQuerySchema>;

export const AuthenticatedUserResponseDataSchema = z.object({
  user: AuthenticatedUserSchema,
});

export type AuthenticatedUserResponseData = z.infer<typeof AuthenticatedUserResponseDataSchema>;

export const LogoutResponseDataSchema = z.object({
  success: z.literal(true),
});

export type LogoutResponseData = z.infer<typeof LogoutResponseDataSchema>;

export const VerifyEmailResponseDataSchema = z.object({
  verified: z.literal(true),
});

export type VerifyEmailResponseData = z.infer<typeof VerifyEmailResponseDataSchema>;

export const ResendVerificationEmailResponseDataSchema = z.union([
  z.object({ alreadyVerified: z.literal(true) }),
  z.object({ sent: z.literal(true) }),
]);

export type ResendVerificationEmailResponseData = z.infer<
  typeof ResendVerificationEmailResponseDataSchema
>;

export const ForgotPasswordResponseDataSchema = z.object({
  sent: z.literal(true),
});

export type ForgotPasswordResponseData = z.infer<typeof ForgotPasswordResponseDataSchema>;

export const ResetPasswordResponseDataSchema = z.object({
  reset: z.literal(true),
});

export type ResetPasswordResponseData = z.infer<typeof ResetPasswordResponseDataSchema>;
