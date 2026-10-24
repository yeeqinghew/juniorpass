// hooks/useParseArrayString.js
import { useCallback } from "react";

const useParseArrayString = () => {
  const parseArrayString = useCallback((arrayString: string): string[] => {
    // Remove curly brackets and split the string by commas
    const trimmedString = arrayString.replace(/[{}]/g, "");
    const arrayValues = trimmedString.split(",");
    // Trim whitespace from each value and return the array
    return arrayValues.map((value) => value.trim());
  }, []);

  return parseArrayString;
};

export default useParseArrayString;
