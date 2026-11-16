// The first letter a dictionary word is filed under on /palavras/<letter>/:
// accents folded (água under a), anything else under the letter itself.
export const letterOf = (term) =>
  String(term).normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toLowerCase();

// The A–Z page a word is filed under: its letter, or "0-9" for "2.ª feira".
// null for anything else (symbols), which no list shows.
export const shelfOf = (term) => {
  const l = letterOf(String(term).replace(/^([oa]s? |um |uma )/i, ''));
  return /^[a-z]$/.test(l) ? l : /^[0-9]$/.test(l) ? '0-9' : null;
};
