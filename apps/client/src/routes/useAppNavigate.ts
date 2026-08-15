import { useCallback } from "react";
import { type NavigateOptions, type To, useNavigate } from "react-router-dom";

/** React Router가 관리하는 앱 내 이력이 하나 이상 쌓였는지 확인한다. */
export const canNavigateBack = (historyState: unknown): boolean => {
  if (typeof historyState !== "object" || historyState === null) return false;

  const historyIndex = (historyState as { readonly idx?: unknown }).idx;
  return typeof historyIndex === "number" && Number.isInteger(historyIndex) && historyIndex > 0;
};

/**
 * 앱 내부 이동을 한 곳에서 관리한다.
 * 숫자 기반 뒤로가기는 브라우저의 기존 이력 이동을 그대로 사용한다.
 */
export const useAppNavigate = () => {
  const navigate = useNavigate();

  return useCallback(
    (to: To | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        return navigate(to);
      }

      return navigate(to, {
        ...options,
        viewTransition: options?.viewTransition ?? false,
      });
    },
    [navigate],
  );
};

/**
 * 단축 진입처럼 앱 내 이력이 없는 상태에서도 뒤로가기가 항상 앱 안의 안전한 경로로 이동하게 한다.
 */
export const useAppBackNavigate = (fallback: To) => {
  const navigate = useAppNavigate();

  return useCallback(() => {
    if (canNavigateBack(window.history.state)) {
      void navigate(-1);
      return;
    }

    void navigate(fallback, { replace: true });
  }, [fallback, navigate]);
};
