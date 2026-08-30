import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'cloudfunctions/**', 'src/uni_modules/**'],
  },
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        sourceType: 'module',
      },
    },
  },
  {
    rules: {
      // 单文件页面组件（pages/**/index.vue）允许单词命名
      'vue/multi-word-component-names': 'off',
      // 工程规范：禁止 any（AGENTS.md TypeScript 约束）
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  prettierConfig,
)
