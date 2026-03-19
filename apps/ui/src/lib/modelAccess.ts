const FREE_TIER_MODEL_IDS = new Set([
  'gemini-3.1-flash',
  'gpt-5.2-mini',
])

export function filterModelsForTier<T extends { id: string }>(models: T[], tier: string | null | undefined): T[] {
  if (tier !== 'free') return models
  return models.filter((model) => FREE_TIER_MODEL_IDS.has(model.id))
}

export function getDefaultModelForTier(models: Array<{ id: string }>, tier: string | null | undefined): string | null {
  const filtered = filterModelsForTier(models, tier)
  return filtered[0]?.id || null
}

export { FREE_TIER_MODEL_IDS }
