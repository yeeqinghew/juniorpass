const getBaseURL = () => {
  // Use the env variable, but hard-fallback to 5000 for safety
  const port = import.meta.env.VITE_API_PORT || "5000";
  const hostname = window.location.hostname;

  // In Development (Vite dev server)
  if (import.meta.env.DEV) {
    return `http://${hostname}:${port}`;
  }

  // In Production (When files are built and served by Express)
  // We return an empty string so it uses a relative path (e.g., /misc/...)
  return ""; 
};

export default getBaseURL;