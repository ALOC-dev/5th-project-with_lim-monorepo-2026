import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "noreply@sai42.app";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "noreply@sai42.app";
const send = async (payload: Parameters<typeof resend.emails.send>[0]) => {
  const { error } = await resend.emails.send(payload);
  if (error) {
    throw new Error(`resend: ${error.name} - ${error.message}`);
  }
};

export const sendPasswordResetCode = async (to: string, code: string) => {
  await send({
    from: FROM,
    to,
    subject: "비밀번호 재설정 인증번호",
    html: `<p>아래 인증번호를 입력해주세요. (5분 이내 유효)</p>
<p style="font-size: 24px; font-weight: bold;">${code}</p>`,
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
