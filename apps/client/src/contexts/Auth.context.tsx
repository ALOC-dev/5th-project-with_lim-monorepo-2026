import {
  type AuthenticatedUser,
  AuthenticatedUserResponseDataSchema,
  createApiResponseSchema,
} from "@monorepo/api-contracts";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

import { requestGetMe } from "../apis/users";

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
