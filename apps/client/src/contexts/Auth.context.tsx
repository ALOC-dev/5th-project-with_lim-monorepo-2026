import {
  type AuthenticatedUser,
  AuthenticatedUserResponseDataSchema,
  createApiResponseSchema,
} from "@monorepo/api-contracts";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

import { client } from "../apis/client";

const meResponseSchema = createApiResponseSchema(AuthenticatedUserResponseDataSchema);

type AuthContextType = {
  isAuthenticated: boolean; // 로그인 여부
  isLoading: boolean;
  user: AuthenticatedUser | null; // 로그인한 유저의 정보
  login: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // 백엔드에 쿠키 유효한지 확인 요청
        const response = await client.get("http://localhost:3000/api/users/me");

        // 백엔드에서 받은 데이터가 약속한 규격에 맞는지 확인
        const result = meResponseSchema.parse(response.data);

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

  const login = () => setIsAuthenticated(true);

  const logout = () => {
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
