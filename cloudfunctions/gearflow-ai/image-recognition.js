const CATEGORIES = [
  'computer',
  'phone',
  'tablet',
  'monitor',
  'headphones',
  'keyboard',
  'mouse',
  'camera',
  'console',
  'nas',
  'storage',
  'other',
]
const MAX_IMAGE_BYTES = 1024 * 1024

function validateImage(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).length !== 2 ||
    !['image/jpeg', 'image/png'].includes(input.mimeType) ||
    typeof input.content !== 'string' ||
    !input.content ||
    input.content.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(input.content) ||
    input.content.length % 4 !== 0
  )
    throw new Error('INVALID_AI_INPUT')
  const bytes = Buffer.from(input.content, 'base64')
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString('base64') !== input.content)
    throw new Error('INVALID_AI_INPUT')
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const jpeg = Buffer.from([255, 216, 255])
  if (
    input.mimeType === 'image/png'
      ? !bytes.subarray(0, 8).equals(png)
      : !bytes.subarray(0, 3).equals(jpeg)
  )
    throw new Error('INVALID_AI_INPUT')
  return { mimeType: input.mimeType, content: input.content }
}

function parseRecognition(text) {
  if (typeof text !== 'string' || text.length > 12000) throw new Error('INVALID_AI_RESULT')
  let result
  try {
    result = JSON.parse(
      text
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, ''),
    )
  } catch {
    throw new Error('INVALID_AI_RESULT')
  }
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw new Error('INVALID_AI_RESULT')
  function optional(value, max) {
    if (value === null || value === undefined || value === '') return null
    if (typeof value !== 'string' || value.length > max || /[\x00-\x1f]/.test(value))
      throw new Error('INVALID_AI_RESULT')
    return value.trim() || null
  }
  const code = optional(result.category, 32)
  return {
    category: CATEGORIES.includes(code) ? code : null,
    brand: optional(result.brand, 64),
    model: optional(result.model, 128),
  }
}

async function recognizeImage(input, invoke) {
  const image = validateImage(input)
  if (typeof invoke !== 'function') throw new Error('AI_UNAVAILABLE')
  const response = await invoke({
    messages: [
      {
        role: 'system',
        content: `你是设备识别助手。只输出 JSON，字段为 category、brand、model。category 只能是 ${CATEGORIES.join('、')} 之一。只根据图片中清晰可见的信息判断，无法确认时填 null。不要提取序列号或个人信息，不要输出额外内容。`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${image.mimeType};base64,${image.content}` },
          },
          { type: 'text', text: '识别图片中的主要设备。' },
        ],
      },
    ],
  })
  return parseRecognition(response?.text)
}

module.exports = { validateImage, parseRecognition, recognizeImage }
