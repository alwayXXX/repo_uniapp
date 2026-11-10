function parseTextLists(text, fields) {
  if (typeof text !== 'string' || text.length > 12000) throw new Error('INVALID_AI_RESULT')
  const normalized = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let result
  try {
    result = JSON.parse(normalized)
  } catch {
    throw new Error('INVALID_AI_RESULT')
  }
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw new Error('INVALID_AI_RESULT')
  return Object.fromEntries(
    fields.map((field) => {
      const value = result[field]
      if (
        !Array.isArray(value) ||
        value.length > 5 ||
        value.some((item) => typeof item !== 'string' || !item.trim() || item.length > 300)
      )
        throw new Error('INVALID_AI_RESULT')
      return [field, value.map((item) => item.trim())]
    }),
  )
}

module.exports = { parseTextLists }
