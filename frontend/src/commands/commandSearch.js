/**
 * Command palette search — pure, framework-free (testable with node --test).
 *
 * Searches the SAME AppCommand objects the registry holds (no separate list),
 * across: title, description, keywords, group, shortcut and id — in both Arabic
 * and English. Matching is normalized so users don't have to be exact.
 */

/** Strip Arabic diacritics/tatweel and fold common letter variants. */
const normalizeArabic = (s) =>
  s
    .replace(/[ً-ْٰ]/g, '') // harakat + superscript alef
    .replace(/ـ/g, '') // tatweel ـ
    .replace(/[آأإٱ]/g, 'ا') // آ أ إ ٱ → ا
    .replace(/ى/g, 'ي') // ى → ي
    .replace(/ة/g, 'ه') // ة → ه
    .replace(/ؤ/g, 'و') // ؤ → و
    .replace(/ئ/g, 'ي'); // ئ → ي

/**
 * Normalize for comparison: lowercase, fold Arabic letter forms, drop
 * diacritics, and collapse runs of whitespace. (Used for both haystack and
 * query so partial substring matching "just works".)
 */
export function normalizeText(input) {
  return normalizeArabic(String(input ?? '').toLowerCase())
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build the normalized searchable text for one command. */
export function commandHaystack(cmd) {
  return normalizeText(
    [
      cmd.title,
      cmd.description,
      Array.isArray(cmd.keywords) ? cmd.keywords.join(' ') : '',
      cmd.group,
      cmd.shortcut,
      cmd.id,
    ]
      .filter(Boolean)
      .join(' ')
  );
}

/**
 * Score a command against pre-normalized query tokens. Returns 0 when any token
 * is missing (AND semantics), otherwise a relevance score (title hits rank
 * higher than keyword/group/id hits).
 */
export function scoreCommand(cmd, tokens) {
  if (tokens.length === 0) return 1;
  const hay = commandHaystack(cmd);
  for (const t of tokens) {
    if (!hay.includes(t)) return 0;
  }
  const title = normalizeText(cmd.title);
  const joined = tokens.join(' ');
  let score = 1;
  if (title.startsWith(joined)) score += 100;
  else if (title.includes(joined)) score += 50;
  else if (tokens.every((t) => title.includes(t))) score += 20;
  return score;
}

/**
 * Filter + rank commands for a query. Empty query returns the list unchanged
 * (the palette shows recents/all itself). Ties break by title for stability.
 */
export function searchCommands(commands, query) {
  const q = normalizeText(query);
  if (!q) return [...commands];
  const tokens = q.split(' ').filter(Boolean);
  return commands
    .map((cmd) => ({ cmd, score: scoreCommand(cmd, tokens) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.cmd.title.localeCompare(b.cmd.title, 'ar'))
    .map((x) => x.cmd);
}
