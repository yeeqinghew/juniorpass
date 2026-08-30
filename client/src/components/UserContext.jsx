/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { fetchWithAuth, API_ENDPOINTS } from "../utils/api";
import toast from "react-hot-toast";

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const setAuth = useCallback((status, userData = null) => {
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

      const userData = await profileResponse.json();
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
