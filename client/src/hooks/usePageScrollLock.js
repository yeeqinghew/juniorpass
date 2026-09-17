import { useEffect } from "react";

let activeLocks = 0;

const syncScrollLock = () => {
  document.body.classList.toggle("app-scroll-locked", activeLocks > 0);
};

const usePageScrollLock = (locked) => {
  useEffect(() => {
    if (!locked) return undefined;

    activeLocks += 1;
    syncScrollLock();

    return () => {
      activeLocks = Math.max(0, activeLocks - 1);
      syncScrollLock();
    };
  }, [locked]);
};

export default usePageScrollLock;
