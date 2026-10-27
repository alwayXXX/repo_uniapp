import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SECRET_ENV_NAMES = [
  'WX_SECRET',
  'TCB_CREDENTIALS_JSON',
  'TCB_SECRET_KEY',
  'TENCENTCLOUD_SECRETKEY',
  'CLOUDBASE_API_KEY',
]

function credentialPatterns(content) {
  const findings = []
  // Require key material, not a library's bare PEM header constant.
  if (
    /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----(?:\s|\\r|\\n)*[A-Za-z0-9+/=]{32,}/.test(
      content,
    )
  ) {
    findings.push('private key')
  }
  if (/\bAKID[A-Za-z0-9]{32,}\b/.test(content)) findings.push('Tencent credential ID')
  if (
    /\b(?:WX_SECRET|TCB_SECRET_KEY|TENCENTCLOUD_SECRETKEY|CLOUDBASE_API_KEY|CLOUDBASE_APIKEY|appSecret|secretKey|private_key|privateKey)\b["']?\s*[:=]\s*(["'`])[A-Za-z0-9+/=_-]{16,}\1/i.test(
      content,
    )
  ) {
    findings.push('credential literal')
  }
  for (const token of content.matchAll(
    /\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+\b/g,
  )) {
    try {
      const claims = JSON.parse(Buffer.from(token[1], 'base64url').toString('utf8'))
      if (claims?.role === 'service_role') findings.push('service_role token')
    } catch {
      // Only decoded service-role credentials count; arbitrary library strings do not.
    }
  }
  return findings
}

export function verifyRelease(directory, environment = {}) {
  const root = resolve(directory)
  const failures = []
  const configuredSecrets = SECRET_ENV_NAMES.map((name) => environment[name]).filter(
    (value) => typeof value === 'string' && value.trim().length > 0,
  )
  const exactValues = new Set(
    configuredSecrets.flatMap((value) => [value, JSON.stringify(value).slice(1, -1)]),
  )
  const warnings =
    configuredSecrets.length === 0 ? ['未配置精确密钥值：附加精确值扫描未执行。'] : []
  let scannedFiles = 0
  let scanStatus = 'not_run'

  function readJson(path) {
    try {
      return JSON.parse(readFileSync(join(root, path), 'utf8'))
    } catch {
      failures.push(`缺少或无效的构建 JSON: ${path}`)
      return null
    }
  }

  function scan(directoryPath) {
    for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
      const path = join(directoryPath, entry.name)
      const label = relative(root, path).replaceAll('\\', '/')
      if (entry.isSymbolicLink()) {
        failures.push(`构建产物不应包含符号链接: ${label}`)
      } else if (entry.isDirectory()) {
        scan(path)
      } else if (entry.isFile()) {
        const content = readFileSync(path, 'utf8')
        scannedFiles += 1
        if (
          /^\.env(?:\.|$)/i.test(basename(path)) ||
          /^tcb_custom_login.*\.json$/i.test(basename(path))
        ) {
          failures.push(`构建产物包含配置或凭据文件: ${label}`)
        }
        const patterns = credentialPatterns(content)
        if (patterns.length)
          failures.push(
            `构建产物疑似包含服务端凭据 (${[...new Set(patterns)].join(', ')}): ${label}`,
          )
        if ([...exactValues].some((value) => content.includes(value))) {
          failures.push(`构建产物命中已配置的密钥精确值: ${label}`)
        }
      }
    }
  }

  if (!existsSync(root) || !statSync(root).isDirectory()) {
    failures.push('请先执行 pnpm build:mp-weixin:release')
  } else {
    const project = readJson('project.config.json')
    if (project?.setting?.urlCheck !== true) failures.push('生产构建必须开启 setting.urlCheck')
    if (project && Object.hasOwn(project, 'cloudfunctionRoot'))
      failures.push('发布构建不应声明 cloudfunctionRoot；云函数必须独立部署')
    if (existsSync(join(root, 'cloudfunctions')))
      failures.push('发布构建不应包含服务端 cloudfunctions/ 目录')
    const app = readJson('app.json')
    if (!Array.isArray(app?.pages) || app.pages.length === 0)
      failures.push('构建产物缺少有效页面列表')
    const pages = Array.isArray(app?.pages) ? [...app.pages] : []
    for (const packages of [app?.subPackages, app?.subpackages]) {
      if (!Array.isArray(packages)) continue
      for (const pkg of packages) {
        if (typeof pkg?.root !== 'string' || !Array.isArray(pkg.pages)) continue
        pages.push(...pkg.pages.map((page) => `${pkg.root.replace(/\/$/, '')}/${page}`))
      }
    }
    if (pages.some((page) => typeof page === 'string' && /^\/?pages\/dev(?:\/|$)/.test(page))) {
      failures.push('正式构建不应注册 pages/dev/* 路由（含分包）')
    }
    try {
      scanStatus = 'incomplete'
      scan(root)
      scanStatus = 'complete'
    } catch {
      failures.push('无法完成构建文件扫描，请检查文件权限后重试')
    }
  }
  return {
    failures,
    warnings,
    scannedFiles,
    scanStatus,
    exactSecretCount: configuredSecrets.length,
  }
}

export function formatVerification(result) {
  const status = {
    complete: '已完成',
    incomplete: '未完成',
    not_run: '未执行',
  }[result.scanStatus]
  const level = result.scanStatus === 'complete' ? 'INFO' : 'WARN'
  return [
    ...result.failures.map((message) => `[FAIL] ${message}`),
    ...result.warnings.map((message) => `[WARN] ${message}`),
    `[${level}] 通用凭据模式扫描：${status}，已读取 ${result.scannedFiles} 个文件。`,
    ...(result.exactSecretCount > 0
      ? [`[${level}] 附加精确值扫描：${status}，已配置 ${result.exactSecretCount} 项。`]
      : []),
    ...(result.failures.length === 0 && result.scanStatus === 'complete'
      ? ['[PASS] Phase 10 自用体验版本地构建检查通过；平台上传与手机验收需分别记录。']
      : []),
  ]
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyRelease('dist/build/mp-weixin', process.env)
  for (const line of formatVerification(result)) console.log(line)
  process.exitCode = result.failures.length > 0 ? 1 : 0
}
