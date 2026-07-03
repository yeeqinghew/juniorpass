import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { jwtDecode } from "jwt-decode";
import { fetchWithAuth, API_ENDPOINTS } from "../utils/api";
import toast from "react-hot-toast";

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  console.log("🟡 UserProvider component mounted/re-rendered");

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const setAuth = useCallback((status, userData = null) => {
    console.log("🟡 setAuth called - status:", status, "userData:", userData);
    setIsAuthenticated(status);
    setUser(userData);
  }, []);

  const fetchUserDataAndAuth = useCallback(
    async (token) => {
      console.log("🟡 fetchUserDataAndAuth called with token:", token?.substring(0, 20) + "...");
      try {
        setLoading(true);
        const profileResponse = await fetchWithAuth(API_ENDPOINTS.VERIFY_TOKEN, {
          method: "GET",
        });

        console.log("🟡 Profile response status:", profileResponse.status);

        if (profileResponse.ok) {
          const userData = await profileResponse.json();
          console.log("🟢 User data fetched successfully:", userData);
          setAuth(true, userData);
        } else {
          console.error(
            "🔴 Failed to fetch user profile, token might be invalid or session expired."
          );
          localStorage.removeItem("token");
          setAuth(false);
          toast.error(
            "Your session has expired or is invalid. Please log in again."
          );
        }
      } catch (error) {
        console.error("🔴 Error in fetchUserDataAndAuth:", error);
        localStorage.removeItem("token");
        setAuth(false);
        toast.error(
          "An error occurred while authenticating. Please try again."
        );
      } finally {
        setLoading(false);
        console.log("🟡 fetchUserDataAndAuth completed, loading set to false");
      }
    },
    [setAuth]
  );

  // NEW: Function to explicitly re-evaluate authentication status
  const reauthenticate = useCallback(async () => {
    console.log("🟡 reauthenticate called");
    setLoading(true); // Start loading when reauthenticating
    const token = localStorage.getItem("token"); // Read the token fresh

    console.log("🟡 Token from localStorage:", token ? "exists" : "null");

    if (!token) {
      console.log("🔴 No token found, setting auth to false");
      setAuth(false);
      setLoading(false);
      return;
    }

    try {
      const decodedToken = jwtDecode(token);
      console.log("🟡 Decoded token:", decodedToken);
      if (decodedToken.exp * 1000 < Date.now()) {
        console.log("🔴 Token expired during reauthentication.");
        localStorage.removeItem("token");
        setAuth(false);
        toast.error("Your session has expired. Please log in again.");
      } else {
        console.log("🟢 Token valid, fetching user data");
        await fetchUserDataAndAuth(token); // Fetch user data if token is valid
      }
    } catch (error) {
      console.error(
        "🔴 Invalid token or decoding error during reauthentication:",
        error
      );
      localStorage.removeItem("token");
      setAuth(false);
      toast.error("Invalid session. Please log in again.");
    } finally {
      setLoading(false); // Ensure loading is off after attempt
      console.log("🟡 reauthenticate completed");
    }
  }, [setAuth, fetchUserDataAndAuth]);

  useEffect(() => {
    console.log("🟡 UserProvider useEffect triggered - running initial reauthenticate");
    // Initial check when the component mounts
    reauthenticate(); // Use the new reauthenticate function here

    // Add an event listener for storage changes (for cross-tab/window sync)
    const handleStorageChange = (event) => {
      console.log("🟡 Storage change detected - key:", event.key);
      if (event.key === "token") {
        console.log("🟡 Token changed in localStorage, reauthenticating");
        reauthenticate(); // Re-check authentication status if token in localStorage changes
      }
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      console.log("🟡 UserProvider cleanup - removing storage listener");
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [reauthenticate]); // Depend on reauthenticate

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
