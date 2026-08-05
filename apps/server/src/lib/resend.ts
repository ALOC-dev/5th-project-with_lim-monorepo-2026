import { Resend } from "resend";

import { FRONTEND_URL } from "./env.js";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "noreply@sai42.app";
const send = async (payload: Parameters<typeof resend.emails.send>[0]) => {
  const { error } = await resend.emails.send(payload);
  if (error) {
    throw new Error(`resend: ${error.name} - ${error.message}`);
  }
};

export const sendVerificationEmail = async (to: string, token: string) => {
  const verifyUrl = `${process.env.APP_URL}/api/auth/verify-email?token=${token}`;

  await send({
    from: FROM,
    to,
    subject: "이메일 인증을 완료해주세요",
    html: `<p>아래 링크를 클릭하면 이메일 인증이 완료됩니다. (24시간 이내 유효)</p>
<p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
  });
};

export const sendSignupVerificationCode = async (to: string, code: string) => {
  await send({
    from: FROM,
    to,
    subject: "회원가입 인증번호",
    html: `<p>아래 인증번호를 입력해주세요. (5분 이내 유효)</p>
<p style="font-size: 24px; font-weight: bold;">${code}</p>`,
  });
};

export const sendPasswordResetEmail = async (to: string, token: string) => {
  const resetUrl = `${FRONTEND_URL}/login/forgotpassword/reset?token=${token}`;

  await send({
    from: FROM,
    to,
    subject: "비밀번호 재설정",
    html: `<p>아래 링크를 클릭하면 비밀번호를 재설정할 수 있습니다. (1시간 이내 유효)</p>
<p><a href="${resetUrl}">${resetUrl}</a></p>`,
  });
};
