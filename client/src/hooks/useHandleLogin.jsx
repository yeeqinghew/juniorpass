import toast from "react-hot-toast";
import getBaseURL from "../utils/config";
import { useNavigate } from "react-router-dom";
import { useUserContext } from "../components/UserContext";

const useHandleLogin = ({ from }) => {
  const baseURL = getBaseURL();
  const navigate = useNavigate();
  const { reauthenticate, setAuth } = useUserContext();

  const handleResponse = async (response, originalNavigatePath) => {
    try {
      const parseRes = await response.json();

      if (response.ok && parseRes.token) {
        localStorage.setItem("token", parseRes.token);

        toast.success("Login successfully", {
          duration: 4000,
        });

        await reauthenticate();

        let finalNavigatePath = originalNavigatePath || "/profile"; // Default to /profile if 'from' is null/undefined
        const ignoredPathsForRedirect = [
          "/", // Homepage
          "/pricing",
          "/about-us",
          "/partner-contact",
        ];

        // If the user came from an ignored page, redirect them to /profile
        if (ignoredPathsForRedirect.includes(finalNavigatePath)) {
          finalNavigatePath = "/profile";
        }

        // Delay the navigation to allow the toast to stay visible
        setTimeout(() => {
          navigate(finalNavigatePath);
        }, 4000); // Wait for the toast to finish before navigating
      } else {
        setAuth(false);
        toast.error(parseRes.message || "Invalid credentials");
      }
    } catch (error) {
      console.error("Error parsing response:", error.message);
      toast.error("An error occurred while processing the response.");
    }
  };

  const handleGoogleLogin = async (values) => {
    try {
      const { clientId, credential, select_by } = values;
      if (credential) {
        const response = await fetch(`${baseURL}/auth/login/google`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            googleCredential: credential,
          }),
        });
        await handleResponse(response, from);
      }
    } catch (error) {
      console.error(error.message);
      toast.error("An error has occured during Google Login.");
    }
  };

  return { handleResponse, handleGoogleLogin };
};

export default useHandleLogin;
