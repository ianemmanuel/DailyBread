import { Filter } from "bad-words"
import type { ContentModerationProvider, ModerationFlag, ModerationInput } from "./types"

/*
 * The only ContentModerationProvider today — the `bad-words` wordlist filter,
 * the same library the outlet-name and (previously inline) profile checks
 * already used. Wrapped here so it's swappable: see ./index.ts.
 *
 * `bad-words` only exposes isProfane(string) → boolean, so to report WHICH
 * token tripped it we tokenise and test each token. Cheap (these fields are
 * short) and gives the moderator the actual offending word.
 */

/*
 * Built once at module load, never per call. `bad-words` compiles its wordlist
 * on construction, so a per-call `new Filter()` would be the entire cost of
 * screening — this is what keeps a check to microseconds on the fields we
 * actually screen (a name, a tagline, a description, a story).
 */
const filter = new Filter()

/*
 * Screening is on the write path of every vendor edit, so it is bounded rather
 * than trusted to stay short. Every screened field already has its own length
 * cap well under this; the ceiling exists so a field that loses its cap later
 * can never turn a save into a slow request.
 */
const MAX_SCREEN_LENGTH = 4000

function offendingTokens(input: string): string[] {
  const text = input.length > MAX_SCREEN_LENGTH ? input.slice(0, MAX_SCREEN_LENGTH) : input
  const tokens = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const hits = new Set<string>()
  for (const tok of tokens) {
    if (filter.isProfane(tok)) hits.add(tok.toLowerCase())
  }
  // Catch multi-token / spacing-evasion cases the per-token pass misses.
  if (hits.size === 0 && filter.isProfane(text)) hits.add("(obscured term)")
  return [...hits]
}

export const badWordsProvider: ContentModerationProvider = {
  name: "bad-words",

  async screenText(input: ModerationInput): Promise<ModerationFlag[]> {
    const flags: ModerationFlag[] = []
    for (const [field, value] of Object.entries(input)) {
      if (!value) continue
      for (const match of offendingTokens(value)) {
        flags.push({ field, reason: "INAPPROPRIATE_CONTENT", match })
      }
    }
    return flags
  },
}
