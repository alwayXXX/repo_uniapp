import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

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

function main() {
  // A generic SCF timer cannot establish WeChat cloud-call credentials. Never
  // use the legacy credential or mutate triggers through this inspection tool.
  if (['--probe', '--verify', '--legacy-configure'].some((flag) => process.argv.includes(flag)))
    throw new Error('USE_NATIVE_WECHAT_TIMER_ONLY')

  const config = JSON.parse(readFileSync('cloudbaserc.json', 'utf8'))
  const fn = config.functions.find((item) => item.name === 'gearflow-api')
  const trigger = fn?.triggers?.find((item) => item.name === 'gearflow-warranty-reminders')
  const cliArg = process.argv.indexOf('--cli')
  const cli = cliArg >= 0 ? process.argv[cliArg + 1] : process.env.CLOUDBASE_CLI_ENTRY
  if (!cli || !fn || !trigger || !config.envId) throw new Error('MISSING_TIMER_CONFIGURATION')
  const args = ['--json', '-e', config.envId, '--region', config.region || 'ap-shanghai']
  function call(command) {
    // No shell, inherited stdio or raw errors: detail may contain credentials.
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
  if (!detail.Namespace) throw new Error('MISSING_FUNCTION_NAMESPACE')
  const listing = call([
    'api',
    'scf',
    'ListTriggers',
    '--api-version',
    '2018-04-16',
    '--body',
    JSON.stringify({ FunctionName: fn.name, Namespace: detail.Namespace, Limit: 100 }),
  ])
  console.log(
    JSON.stringify({
      inspectionOnly: true,
      genericScfTriggersOnly: true,
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main()
  } catch (error) {
    const code = /^[A-Za-z0-9_.-]{1,100}$/.test(error.message)
      ? error.message
      : 'TIMER_INSPECTION_FAILED'
    console.error(code)
    process.exitCode = 1
  }
}
