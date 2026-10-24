import { useEffect } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import "./App.css";
import { UserProvider } from "./components/UserContext";
import Routers from "./router";

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

const App = () => {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <UserProvider>
        <Routers />
      </UserProvider>
      <Analytics />
    </BrowserRouter>
  );
};

export default App;
