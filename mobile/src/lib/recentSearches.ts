/** How many past queries the search box offers as shortcuts. */
export const MAX_RECENT_SEARCHES = 6;

/** Prepend `query` to the history, de-duplicated case-insensitively and capped. */
export const addRecentSearch = (
  history: readonly string[],
  query: string
): string[] => {
  const trimmed = query.trim();
  if (!trimmed) return [...history];

  const withoutDuplicate = history.filter(
    (entry) => entry.toLowerCase() !== trimmed.toLowerCase()
  );

  return [trimmed, ...withoutDuplicate].slice(0, MAX_RECENT_SEARCHES);
};

/** Read the persisted history defensively — storage content is untrusted input. */
export const parseRecentSearches = (raw: string | null): string[] => {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
};
