// The first letter a dictionary word is filed under on /palavras/<letter>/:
// accents folded (água under a), anything else under the letter itself.
export const letterOf = (term) =>
  String(term).normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toLowerCase();
