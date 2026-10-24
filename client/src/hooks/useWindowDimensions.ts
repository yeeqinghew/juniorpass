import { useEffect, useState } from "react";

// Helper function to get window dimensions and screen size category
export type WindowDimensions = {
  width: number;
  height: number;
  isDesktop: boolean;
  isTabletLandscape: boolean;
  isTabletPortrait: boolean;
  isMobile: boolean;
};

function getWindowDimensions(): WindowDimensions {
  const { innerWidth: width, innerHeight: height } = window;

  // Updated breakpoints to match new responsive system
  const isDesktop = width >= 1336; // Desktop: width >= 1336px
  const isTabletLandscape = width >= 1024 && width < 1336; // Tablet Landscape: 1024px <= width < 1336px
  const isTabletPortrait = width >= 768 && width < 1024; // Tablet Portrait: 768px <= width < 1024px
  const isMobile = width < 768; // Mobile: width < 768px

  return {
    width,
    height,
    isDesktop,
    isTabletLandscape,
    isTabletPortrait,
    isMobile,
  };
}

export default function useWindowDimensions(): WindowDimensions {
  const [windowDimensions, setWindowDimensions] = useState(
    getWindowDimensions(),
  );

  useEffect(() => {
    function handleResize() {
      setWindowDimensions(getWindowDimensions());
    }

    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return windowDimensions;
}
