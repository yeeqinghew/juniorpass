import { useState } from "react";

export const useLocalStorage = <T>(keyName: string, defaultValue: T): T | null => {
  const [storedValue] = useState<T | null>(() => {
    try {
      const value = localStorage.getItem(keyName);
      if (value) {
        return JSON.parse(value) as T;
      } else {
        return null;
      }
    } catch {
      return defaultValue;
    }
  });

  return storedValue;
};
