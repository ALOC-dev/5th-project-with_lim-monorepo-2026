import { z } from "zod";

export const AuthenticatedUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  nickname: z.string().min(1),
});

export type AuthenticatedUser = z.infer<typeof AuthenticatedUserSchema>;

export const PasswordSchema = z
  .string()
  .min(8)
  .max(20)
  .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, "password must include letters and numbers");

export const SignupRequestSchema = z.object({
  email: z.email(),
  password: PasswordSchema,
  nickname: z.string().min(1),
});

export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const SendSignupCodeRequestSchema = z.object({
  email: z.email(),
});

export type SendSignupCodeRequest = z.infer<typeof SendSignupCodeRequestSchema>;

export const SendSignupCodeResponseDataSchema = z.object({
  sent: z.literal(true),
});

export type SendSignupCodeResponseData = z.infer<typeof SendSignupCodeResponseDataSchema>;

export const VerifySignupCodeRequestSchema = z.object({
  email: z.email(),
  code: z.string().length(6),
});

export type VerifySignupCodeRequest = z.infer<typeof VerifySignupCodeRequestSchema>;

export const VerifySignupCodeResponseDataSchema = z.object({
  verified: z.literal(true),
});

export type VerifySignupCodeResponseData = z.infer<typeof VerifySignupCodeResponseDataSchema>;

export const NicknameCheckQuerySchema = z.object({
  nickname: z.string().min(1),
});

export type NicknameCheckQuery = z.infer<typeof NicknameCheckQuerySchema>;

export const NicknameCheckResponseDataSchema = z.object({
  available: z.boolean(),
});

export type NicknameCheckResponseData = z.infer<typeof NicknameCheckResponseDataSchema>;

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
