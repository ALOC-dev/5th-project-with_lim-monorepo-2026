import {
  type AuthenticatedUser,
  AuthenticatedUserResponseDataSchema,
  createApiResponseSchema,
} from "@monorepo/api-contracts";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

import { requestLogout } from "../apis/auth";
import { setUnauthorizedHandler } from "../apis/base";
import { requestGetMe, requestWithdraw } from "../apis/users";

const meResponseSchema = createApiResponseSchema(AuthenticatedUserResponseDataSchema);

type AuthContextType = {
  isAuthenticated: boolean; // 로그인 여부
  isLoading: boolean;
  user: AuthenticatedUser | null; // 로그인한 유저의 정보
  login: (user: AuthenticatedUser) => void;
  logout: () => Promise<void>;
  withdraw: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);

  useEffect(() => {
    // 세션 만료/무효화로 어떤 요청이든 401을 받으면 즉시 로그아웃 상태로 반영한다.
    // ProtectedRoute가 isAuthenticated 변화를 보고 /login으로 리다이렉트해 준다.
    setUnauthorizedHandler(() => {
      setIsAuthenticated(false);
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const data = await requestGetMe();

        const result = meResponseSchema.parse(data);

        if (!result.success) {
          throw new Error(result.error || "인증 실패");
        }

        setIsAuthenticated(true);
        setUser(result.data.user);
      } catch (_error) {
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    void initializeAuth();
  }, []);

  const login = (loggedInUser: AuthenticatedUser) => {
    setIsAuthenticated(true);
    setUser(loggedInUser);
  };

  const logout = async (): Promise<void> => {
    const response = await requestLogout();
    if (!response.success) throw new Error(response.error);

    setIsAuthenticated(false);
    setUser(null);
  };

  const withdraw = async (): Promise<void> => {
    const response = await requestWithdraw();

    if (!response.success) throw new Error(response.error);

    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout, withdraw }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
