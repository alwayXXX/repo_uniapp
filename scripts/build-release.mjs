import { spawnSync } from 'node:child_process'

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const result = spawnSync(command, ['build:mp-weixin'], {
  stdio: 'inherit',
  env: { ...process.env, APP_ENV: 'production' },
  // Windows cannot always spawn a .cmd shim directly from a Node process
  // started by pnpm; use the platform shell for the wrapper only.
  shell: process.platform === 'win32',
})

if (result.error) {
  console.error(`无法启动 ${command}: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
