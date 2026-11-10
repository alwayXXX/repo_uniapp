import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const apiFiles = [
  'phase11.js',
  'phase11-domain.js',
  'request-identity.js',
  'package.json',
  'config.json',
]
const aiFiles = [
  'advisor.js',
  'annual.js',
  'canonical.js',
  'gateway.js',
  'grant.js',
  'image-recognition.js',
  'ledger.js',
  'model-response.js',
  'request.js',
]

/** Produce a new isolated directory; this only prepares files and never deploys them. */
export async function prepareFunctions(parent = join(root, '.e2e')) {
  await mkdir(parent, { recursive: true })
  const output = await mkdtemp(join(parent, 'phase12-functions-'))
  const api = join(output, 'gearflow-api')
  const ai = join(output, 'gearflow-ai')
  await mkdir(join(api, 'ai'), { recursive: true })
  await mkdir(ai, { recursive: true })
  const original = await readFile(join(root, 'cloudfunctions/gearflow-api/index.js'), 'utf8')
  for (const reference of ["require('../gearflow-ai/gateway')", "require('../gearflow-ai/ledger')"])
    if (!original.includes(reference))
      throw new Error('Unexpected API import; inspect packaging before deployment')
  const entry = original.replaceAll("require('../gearflow-ai/", "require('./ai/")
  if (entry.includes("require('../gearflow-ai/")) throw new Error('Unexpected sibling AI import')
  await writeFile(join(api, 'index.js'), entry)
  for (const name of apiFiles)
    await copyFile(join(root, 'cloudfunctions/gearflow-api', name), join(api, name))
  for (const name of aiFiles) {
    await copyFile(join(root, 'cloudfunctions/gearflow-ai', name), join(api, 'ai', name))
    await copyFile(join(root, 'cloudfunctions/gearflow-ai', name), join(ai, name))
  }
  for (const name of ['index.js', 'package.json'])
    await copyFile(join(root, 'cloudfunctions/gearflow-ai', name), join(ai, name))
  return output
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(await prepareFunctions())
