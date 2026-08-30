/**
 * pre-commit 仅检查暂存文件（配合 .husky/pre-commit）。
 * cloudfunctions/** 有意被 eslint.config.mjs 忽略，--no-warn-ignored 避免
 * 对这些文件报 "file ignored" 警告导致钩子失败。
 */
export default {
  '*.{ts,vue,mjs}': ['eslint --fix --no-warn-ignored', 'prettier --write'],
  '*.{js,cjs}': ['eslint --fix --no-warn-ignored', 'prettier --write'],
  '*.{json,md,scss,css}': ['prettier --write'],
}
