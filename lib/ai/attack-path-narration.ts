import { ATTACK_PATH_NARRATION_PROMPT } from '@/lib/ai/prompts'
import { generate, extractJSON, type AIResult } from '@/lib/ai/client'

/**
 * Background narration used by the attack-path scanners: returns the
 * `narrative` field of the model's JSON, or the raw text when the model did not
 * return JSON. Result is null-data when no provider produced anything.
 */
export function narrateAttackPathText(pathData: unknown): Promise<AIResult<string>> {
  return generate(
    {
      label: 'attack-path-narration',
      system: ATTACK_PATH_NARRATION_PROMPT,
      prompt: `Analyze this attack path:\n${JSON.stringify(pathData, null, 2)}`,
      json: true,
      temperature: 0.3,
      maxTokens: 1024,
      timeoutMs: 60_000,
    },
    (text) => {
      const parsed = extractJSON(text)
      if (parsed && typeof parsed.narrative === 'string' && parsed.narrative.trim()) return parsed.narrative
      return text.trim() || null
    },
  )
}
