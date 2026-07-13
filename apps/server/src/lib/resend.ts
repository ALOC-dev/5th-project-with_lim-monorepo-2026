import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = 'onboarding@resend.dev';

export const sendVerificationEmail = async (to: string, token: string) => {
    const verifyUrl = `${process.env.APP_URL}/api/auth/verify-email?token=${token}`;

    await resend.emails.send({
        from: FROM,
        to,
        subject: '이메일 인증을 완료해주세요',
        html: `<p>아래 링크를 클릭하면 이메일 인증이 완료됩니다. (24시간 이내 유효)</p>
<p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
    });
};

export const sendPasswordResetEmail = async (to: string, token: string) => {
    await resend.emails.send({
        from: FROM,
        to,
        subject: '비밀번호 재설정',
        html: `<p>아래 토큰으로 비밀번호를 재설정할 수 있습니다. (1시간 이내 유효)</p>
<p>토큰: <code>${token}</code></p>
<p>POST /api/auth/reset-password 에 { token, newPassword } 형태로 요청하세요.</p>`,
    });
};
