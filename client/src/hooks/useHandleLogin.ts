import toast from "react-hot-toast";
import { fetchWithAuth, API_ENDPOINTS } from "../utils/api";
import { useNavigate } from "react-router-dom";
import { useUserContext } from "../components/UserContext";
import type { CredentialResponse } from "@react-oauth/google";
import type { Dispatch, SetStateAction } from "react";

type LoginNavigationState = Record<string, unknown> | null | undefined;

type UseHandleLoginOptions = {
  from?: string | null;
  fromState?: LoginNavigationState;
  setLoading?: Dispatch<SetStateAction<boolean>>;
};

type AuthResponseBody = {
  authenticated?: boolean;
  message?: string;
};

const useHandleLogin = ({ from, fromState, setLoading }: UseHandleLoginOptions) => {
  const navigate = useNavigate();
  const { reauthenticate, setAuth } = useUserContext();

  const handleResponse = async (
    response: Response,
    originalNavigatePath?: string | null,
    originalNavigateState: LoginNavigationState = fromState,
  ): Promise<void> => {
    try {
      const parseRes = (await response.json()) as AuthResponseBody | string;

      if (response.ok && typeof parseRes !== "string" && parseRes.authenticated) {
        const authenticated = await reauthenticate();
        if (!authenticated) {
          toast.error("Login succeeded, but the session could not be verified.");
          return;
        }

        toast.success("Login successfully", {
          duration: 4000,
        });

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
          navigate(finalNavigatePath, { state: originalNavigateState });
        }, 4000); // Wait for the toast to finish before navigating
      } else {
        setAuth(false);
        const message =
          typeof parseRes === "string" ? parseRes : parseRes.message;
        toast.error(message || "Invalid credentials");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error parsing response:", message);
      toast.error("An error occurred while processing the response.");
    }
  };

  const handleGoogleLogin = async (values: CredentialResponse): Promise<void> => {
    try {
      if (setLoading) setLoading(true);
      const { credential } = values;
      if (credential) {
        const response = await fetchWithAuth(API_ENDPOINTS.GOOGLE_LOGIN, {
          method: "POST",
          body: JSON.stringify({
            googleCredential: credential,
          }),
        });
        await handleResponse(response, from);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      toast.error("An error has occured during Google Login.");
    } finally {
      if (setLoading) setLoading(false);
    }
  };

  return { handleResponse, handleGoogleLogin };
};

export default useHandleLogin;
