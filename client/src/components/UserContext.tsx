import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { fetchWithAuth, API_ENDPOINTS } from "../utils/api";
import toast from "react-hot-toast";
import type { UserProfile } from "../types/user";

type ReauthenticateOptions = { silent?: boolean };

type UserContextValue = {
  isAuthenticated: boolean;
  user: UserProfile | null;
  loading: boolean;
  setAuth: (status: boolean, userData?: UserProfile | null) => void;
  setLoading: Dispatch<SetStateAction<boolean>>;
  reauthenticate: (options?: ReauthenticateOptions) => Promise<boolean>;
};

const UserContext = createContext<UserContextValue | null>(null);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const setAuth = useCallback((status: boolean, userData: UserProfile | null = null) => {
    setIsAuthenticated(status);
    setUser(userData);
  }, []);

  const reauthenticate = useCallback(async ({ silent = false } = {}) => {
    setLoading(true);
    try {
      const profileResponse = await fetchWithAuth(API_ENDPOINTS.VERIFY_TOKEN, {
        method: "GET",
      });

      if (!profileResponse.ok) {
        setAuth(false);
        if (!silent) {
          toast.error("Your session has expired. Please log in again.");
        }
        return false;
      }

      const userData = (await profileResponse.json()) as UserProfile;
      setAuth(true, userData);
      return true;
    } catch (error) {
      console.error("Error while authenticating:", error);
      setAuth(false);
      if (!silent) {
        toast.error("Unable to verify your session. Please try again.");
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, [setAuth]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      reauthenticate({ silent: true });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [reauthenticate]);

  useEffect(() => {
    const revalidateWhenReturningToTab = () => {
      if (document.visibilityState === "visible" && isAuthenticated) {
        reauthenticate({ silent: true });
      }
    };

    document.addEventListener("visibilitychange", revalidateWhenReturningToTab);
    return () =>
      document.removeEventListener(
        "visibilitychange",
        revalidateWhenReturningToTab,
      );
  }, [isAuthenticated, reauthenticate]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setAuth(false);
      setLoading(false);
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () =>
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, [setAuth]);

  return (
    <UserContext.Provider
      value={{
        isAuthenticated,
        user,
        loading,
        setAuth,
        setLoading,
        reauthenticate,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUserContext = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUserContext must be used within a UserProvider");
  }
  return context;
};
