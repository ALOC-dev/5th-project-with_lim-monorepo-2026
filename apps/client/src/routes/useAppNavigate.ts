import { useCallback } from "react";
import { type NavigateOptions, type To, useNavigate } from "react-router-dom";

/**
 * 앱 내부 이동을 한 곳에서 관리한다.
 * 숫자 기반 뒤로 가기는 브라우저의 기존 히스토리 전환을 그대로 사용한다.
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
        viewTransition: options?.viewTransition ?? true,
      });
    },
    [navigate],
  );
};
