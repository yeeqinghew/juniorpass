// hooks/useParseListings.js
const useParseListings = () => {
  const parseListings = <T extends object>(listings: T[]): T[] => {
    return listings.map((listing) => {
      return {
        ...listing,
      };
    });
  };

  return parseListings;
};

export default useParseListings;
