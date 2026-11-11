import { presetUni } from '@uni-helper/unocss-preset-uni'
import { presetWot } from '@wot-ui/unocss-preset'
import { defineConfig, type Preset } from 'unocss'

export default defineConfig({
  // Wot's preset bundles a separate @unocss/core version; its runtime contract
  // is compatible, but the two packages expose distinct TypeScript types.
  presets: [
    presetUni({ attributify: false }),
    presetWot({ preflight: false }) as unknown as Preset,
  ],
})
