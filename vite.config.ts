import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

/**
 * 将 cloudfunctions/ 同步到小程序构建产物目录，并在 project.config.json
 * 中声明 cloudfunctionRoot，使微信开发者工具可以直接上传部署云函数。
 */
function cloudbaseSync(): Plugin {
  let outDir = ''
  return {
    name: 'gearflow:cloudbase-sync',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const sourceDir = resolve(__dirname, 'cloudfunctions')
      if (!existsSync(sourceDir) || !outDir) return
      cpSync(sourceDir, resolve(outDir, 'cloudfunctions'), { recursive: true })
      const configPath = resolve(outDir, 'project.config.json')
      if (existsSync(configPath)) {
        const projectConfig = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<
          string,
          unknown
        >
        if (!projectConfig.cloudfunctionRoot) {
          projectConfig.cloudfunctionRoot = 'cloudfunctions/'
        }
        // 禁用 DevTools 上传时 sourcemap 处理，避免 -80407 错误（vite 构建已含压缩）
        // es6:false 跳过 DevTools 的 Babel 二次转译：基础库原生支持 ES6，
        // 转译会把 900KB 级产物膨胀到 2.1MB 触发 80051 主包超限
        projectConfig.setting = {
          ...(projectConfig.setting as Record<string, unknown> | undefined),
          minified: false,
          uploadWithSourceMap: false,
          es6: false,
        }
        writeFileSync(configPath, JSON.stringify(projectConfig, null, 2))
      }
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  // 允许客户端使用 CLOUDBASE_* / APP_* 前缀的公开环境变量（均不含密钥）
  envPrefix: ['VITE_', 'CLOUDBASE_', 'APP_'],
  build: {
    // es2018：??/?. 降级为 es6 等价写法（ES2020 语法会让 DevTools es6:false
    // 模式下的上传解析器报 Unexpected token），async/await 原生保留不膨胀
    target: 'es2018',
  },
  plugins: [uni(), cloudbaseSync()],
})
