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

export const VerifyForgotPasswordCodeRequestSchema = z.object({
  email: z.email(),
  code: z.string().length(6),
});

export type VerifyForgotPasswordCodeRequest = z.infer<typeof VerifyForgotPasswordCodeRequestSchema>;

export const VerifyForgotPasswordCodeResponseDataSchema = z.object({
  verified: z.literal(true),
});

export type VerifyForgotPasswordCodeResponseData = z.infer<
  typeof VerifyForgotPasswordCodeResponseDataSchema
>;

export const ResetPasswordRequestSchema = z.object({
  email: z.email(),
  newPassword: PasswordSchema,
});

export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export const AuthenticatedUserResponseDataSchema = z.object({
  user: AuthenticatedUserSchema,
});

export type AuthenticatedUserResponseData = z.infer<typeof AuthenticatedUserResponseDataSchema>;

export const LogoutResponseDataSchema = z.object({
  success: z.literal(true),
});

export type LogoutResponseData = z.infer<typeof LogoutResponseDataSchema>;

export const ForgotPasswordResponseDataSchema = z.object({
  sent: z.literal(true),
});

export type ForgotPasswordResponseData = z.infer<typeof ForgotPasswordResponseDataSchema>;

export const ResetPasswordResponseDataSchema = z.object({
  reset: z.literal(true),
});

export type ResetPasswordResponseData = z.infer<typeof ResetPasswordResponseDataSchema>;

export const ChangePasswordRequestSchema = z.object({
  newPassword: PasswordSchema,
});

export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const ChangePasswordResponseDataSchema = z.object({
  success: z.literal(true),
});

export type ChangePasswordResponseData = z.infer<typeof ChangePasswordResponseDataSchema>;
