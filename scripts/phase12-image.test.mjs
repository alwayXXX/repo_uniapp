import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { test } from 'node:test'
const require = createRequire(import.meta.url)
const {
  recognizeImage,
  validateImage,
  parseRecognition,
} = require('../cloudfunctions/gearflow-ai/image-recognition.js')
const image = {
  mimeType: 'image/png',
  content: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]).toString('base64'),
}

test('the selected image is sent only to the injected model and unknown fields stay empty', async () => {
  const result = await recognizeImage(image, async (request) => {
    assert.equal(
      request.messages[1].content[0].image_url.url,
      `data:image/png;base64,${image.content}`,
    )
    return { text: '{"category":"phone","brand":"Example","model":null,"serialNumber":"private"}' }
  })
  assert.deepEqual(result, { category: 'phone', brand: 'Example', model: null })
  assert.deepEqual(parseRecognition('{"category":"unsupported","brand":null,"model":null}'), {
    category: null,
    brand: null,
    model: null,
  })
})

test('invalid image bytes, unrelated input fields and invalid model responses fail closed', async () => {
  assert.throws(() => validateImage({ ...image, mimeType: 'image/jpeg' }), /INVALID_AI_INPUT/)
  assert.throws(() => validateImage({ ...image, content: 'AA==' }), /INVALID_AI_INPUT/)
  assert.throws(() => validateImage({ ...image, fileName: 'private' }), /INVALID_AI_INPUT/)
  assert.throws(() => parseRecognition('{"brand":42}'), /INVALID_AI_RESULT/)
  let calls = 0
  await assert.rejects(
    recognizeImage({ ...image, content: 'AA==' }, async () => {
      calls++
    }),
    /INVALID_AI_INPUT/,
  )
  assert.equal(calls, 0)
})
