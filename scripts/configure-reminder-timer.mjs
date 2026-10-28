import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const key = 'GEARFLOW_TIMER_TOKEN'

export function timerVariables(variables, generatedToken) {
  if (!Array.isArray(variables)) throw new Error('INVALID_ENVIRONMENT')
  const existing = variables.find((item) => item.Key === key)
  const token = existing ? existing.Value : generatedToken
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
    throw new Error('INVALID_TIMER_TOKEN')
  return {
    token,
    changed: !existing,
    variables: existing ? variables : [...variables, { Key: key, Value: token }],
  }
}

function parseResult(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('INVALID_CLI_RESPONSE')
  const result = JSON.parse(text.slice(start, end + 1))
  const data = result.data || result.Response || result
  const code = data.Error?.Code || result.error?.code
  if (code) throw new Error(/^[A-Za-z0-9_.-]{1,100}$/.test(code) ? code : 'CLOUD_API_FAILED')
  return data
}

async function main() {
  const config = JSON.parse(readFileSync('cloudbaserc.json', 'utf8'))
  const fn = config.functions.find((item) => item.name === 'gearflow-api')
  const trigger = fn?.triggers?.find((item) => item.name === 'gearflow-warranty-reminders')
  const cliArg = process.argv.indexOf('--cli')
  const cli = cliArg >= 0 ? process.argv[cliArg + 1] : process.env.CLOUDBASE_CLI_ENTRY
  if (!cli || !fn || !trigger || !config.envId) throw new Error('MISSING_TIMER_CONFIGURATION')
  const verify = process.argv.includes('--verify')
  const args = ['--json', '-e', config.envId, '--region', config.region || 'ap-shanghai']
  function call(command) {
    // No shell, inherited stdio or raw errors: body may contain managed credentials.
    const result = spawnSync(process.execPath, [cli, ...command, ...args], {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    })
    if (result.error) throw new Error('CLI_EXECUTION_FAILED')
    const data = parseResult(result.stdout || '')
    if (result.status !== 0) throw new Error('CLI_OPERATION_FAILED')
    return data
  }
  const detail = call(['fn', 'detail', fn.name])
  if (process.argv.includes('--probe')) {
    const token = detail.Environment?.Variables?.find((item) => item.Key === key)?.Value
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
      throw new Error('MISSING_TIMER_TOKEN')
    const result = call([
      'fn',
      'invoke',
      fn.name,
      '--params',
      JSON.stringify({
        Type: 'Timer',
        TriggerName: trigger.name,
        Probe: 'subscription-api',
        Message: JSON.stringify({ timerToken: token }),
      }),
    ])
    let output = result.result || result.Result || result
    if (typeof output === 'string') output = JSON.parse(output)
    if (typeof output.RetMsg === 'string') output = JSON.parse(output.RetMsg)
    if (output.ok !== true || typeof output.data?.available !== 'boolean')
      throw new Error('UNEXPECTED_PROBE_RESPONSE')
    console.log(
      JSON.stringify({
        source: 'plain-cloud-invocation',
        available: output.data.available,
        errorCode: output.data.errorCode,
        missingWxCloudApiToken: output.data.missingWxCloudApiToken === true,
      }),
    )
    return
  }
  const namespace = detail.Namespace
  if (!namespace) throw new Error('MISSING_FUNCTION_NAMESPACE')
  const api = (action, body) =>
    call(['api', 'scf', action, '--api-version', '2018-04-16', '--body', JSON.stringify(body)])
  const base = { FunctionName: fn.name, Namespace: namespace }
  const listing = api('ListTriggers', { ...base, Limit: 100 })
  // Default to inspection: a generic SCF update cannot establish WeChat cloud-call credentials.
  if (!process.argv.includes('--legacy-configure')) {
    if (verify) throw new Error('USE_WECHAT_IDE_FOR_TIMER_VERIFICATION')
    console.log(
      JSON.stringify({
        inspectionOnly: true,
        functionStatus: detail.Status,
        triggers: (listing.Triggers || []).map((item) => ({
          name: item.TriggerName,
          type: item.Type,
          enabled: item.Enable,
          available: item.AvailableStatus,
          cron: item.Type === 'timer' ? JSON.parse(item.TriggerDesc).cron : null,
        })),
      }),
    )
    return
  }
  const current = listing.Triggers.find(
    (item) => item.TriggerName === trigger.name && item.Type === 'timer',
  )
  if (!current) throw new Error('TIMER_NOT_FOUND')
  const currentCron = JSON.parse(current.TriggerDesc).cron
  const originalCron = trigger.config
  if (!originalCron) throw new Error('MISSING_ORIGINAL_CRON')
  const configured = timerVariables(
    detail.Environment?.Variables || [],
    randomBytes(32).toString('hex'),
  )
  if (configured.changed) {
    api('UpdateFunctionConfiguration', {
      ...base,
      Environment: { Variables: configured.variables },
    })
    let active = false
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const ready = call(['fn', 'detail', fn.name])
      if (ready.Status === 'Active') {
        active = true
        break
      }
      await new Promise((done) => setTimeout(done, 2000))
    }
    if (!active) throw new Error('FUNCTION_NOT_ACTIVE')
  }
  let previousArgument = {}
  if (current.CustomArgument?.trim()) previousArgument = JSON.parse(current.CustomArgument)
  if (!previousArgument || Array.isArray(previousArgument) || typeof previousArgument !== 'object')
    throw new Error('UNEXPECTED_TRIGGER_ARGUMENT')
  const body = {
    ...base,
    TriggerName: trigger.name,
    Type: 'timer',
    Qualifier: current.Qualifier,
    Enable: 'OPEN',
    CustomArgument: JSON.stringify({ ...previousArgument, timerToken: configured.token }),
  }
  function update(cron) {
    api('UpdateTrigger', { ...body, TriggerDesc: cron })
  }
  if (
    currentCron !== originalCron ||
    Number(current.Enable) !== 1 ||
    previousArgument.timerToken !== configured.token
  )
    update(originalCron)
  console.log(
    JSON.stringify({ configured: true, existingEnvironmentPreserved: true, cron: originalCron }),
  )
  if (verify) {
    const counts = () =>
      call([
        'db',
        'execute',
        '--read-only',
        '--sql',
        'SELECT status,COUNT(*) AS count FROM device_reminders GROUP BY status',
      ]).items
    const before = new Map(counts().map((item) => [item.status, Number(item.count)]))
    const deadline = Date.now() + 120000
    try {
      update('0 */1 * * * * *')
      console.log(JSON.stringify({ verificationWindow: true, temporaryCron: '0 */1 * * * * *' }))
      while (Date.now() < deadline) {
        await new Promise((done) => setTimeout(done, 5000))
        const rows = counts()
        if (
          rows.some(
            (item) =>
              ['SENT', 'FAILED', 'UNKNOWN', 'CANCELLED'].includes(item.status) &&
              Number(item.count) > (before.get(item.status) || 0),
          )
        ) {
          console.log(JSON.stringify({ states: rows }))
          break
        }
      }
    } finally {
      update(originalCron)
      const restored = api('ListTriggers', { ...base, Limit: 100 }).Triggers.find(
        (item) => item.TriggerName === trigger.name,
      )
      if (JSON.parse(restored.TriggerDesc).cron !== originalCron)
        throw new Error('TIMER_RESTORE_FAILED')
      console.log(JSON.stringify({ originalCronRestored: true, cron: originalCron }))
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    const code = /^[A-Za-z0-9_.-]{1,100}$/.test(error.message)
      ? error.message
      : 'TIMER_CONFIGURATION_FAILED'
    console.error(code)
    process.exitCode = 1
  })
}
