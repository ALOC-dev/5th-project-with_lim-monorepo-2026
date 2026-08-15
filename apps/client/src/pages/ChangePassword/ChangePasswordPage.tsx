import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";

import { requestChangePassword } from "../../apis/users";
import PageRoot from "../../components/PageRoot/PageRoot";
import { tokens } from "../../design-system/tokens.generated";
import { ChangePasswordContext, type ChangePasswordContextType } from "./ChangePassword.context";
import ChangePasswordForm from "./ChangePasswordForm";

const ChangePasswordFlowProvider = ({ children }: { readonly children: ReactNode }) => {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const handleChangePassword = useCallback(async () => {
    if (password.length < 8 || password !== passwordConfirm) {
      throw new Error("Password is not ready");
    }
    await requestChangePassword({ newPassword: password });
  }, [password, passwordConfirm]);

  const resetForm = useCallback(() => {
    setPassword("");
    setPasswordConfirm("");
  }, []);

  const contextValue = useMemo<ChangePasswordContextType>(
    () => ({
      handleChangePassword,
      password,
      passwordConfirm,
      setPassword,
      setPasswordConfirm,
      resetForm,
    }),
    [handleChangePassword, password, passwordConfirm, setPassword, setPasswordConfirm, resetForm],
  );

  return (
    <ChangePasswordContext.Provider value={contextValue}>{children}</ChangePasswordContext.Provider>
  );
};

export default function ChangePasswordPage() {
  return (
    <ChangePasswordFlowProvider>
      <PageRoot backgroundColor={tokens.color.neutral["50"]} layout="contained">
        <ChangePasswordForm />
      </PageRoot>
    </ChangePasswordFlowProvider>
  );
}
