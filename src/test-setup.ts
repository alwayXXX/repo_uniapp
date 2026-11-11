/* eslint-disable vue/one-component-per-file, vue/require-default-prop -- Test-only stand-ins share this setup file and mirror the props used by the pages. */
import { config } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// uni-app resolves Wot's easycom components during compilation. Vitest uses a
// native-button stand-in to exercise the same disabled and click contracts.
config.global.stubs = {
  'wd-button': defineComponent({
    props: { disabled: Boolean, loading: Boolean },
    emits: ['click'],
    setup(props, { emit, slots }) {
      return () =>
        h(
          'button',
          {
            disabled: props.disabled || props.loading,
            onClick: (event: MouseEvent) => {
              if (!props.disabled && !props.loading) emit('click', event)
            },
          },
          slots.default?.(),
        )
    },
  }),
  'wd-input': defineComponent({
    props: { modelValue: [String, Number], disabled: Boolean },
    emits: ['update:modelValue', 'confirm'],
    setup(props, { emit, attrs }) {
      return () =>
        h('input', {
          ...attrs,
          value: props.modelValue,
          disabled: props.disabled,
          onInput: (event: Event) =>
            emit('update:modelValue', (event.target as HTMLInputElement).value),
          onKeydown: (event: KeyboardEvent) => {
            if (event.key === 'Enter') emit('confirm', event)
          },
        })
    },
  }),
  'wd-textarea': defineComponent({
    props: { modelValue: String, disabled: Boolean },
    emits: ['update:modelValue'],
    setup(props, { emit, attrs }) {
      return () =>
        h('textarea', {
          ...attrs,
          value: props.modelValue,
          disabled: props.disabled,
          onInput: (event: Event) =>
            emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
        })
    },
  }),
  'wd-loading': true,
  'wd-icon': true,
  'wd-empty': defineComponent({
    props: { tip: { type: String, default: '' } },
    setup(props, { slots }) {
      return () => h('view', [h('view', props.tip), slots.bottom?.()])
    },
  }),
  'wd-progress': true,
  'wd-popup': defineComponent({
    props: { modelValue: Boolean },
    emits: ['update:modelValue'],
    setup(props, { slots }) {
      return () => (props.modelValue ? h('view', slots.default?.()) : null)
    },
  }),
  'wd-picker': defineComponent({
    name: 'WdPicker',
    props: { visible: Boolean, modelValue: Array, columns: Array },
    emits: ['update:visible', 'confirm'],
    setup: () => () => h('view'),
  }),
  'wd-datetime-picker': defineComponent({
    name: 'WdDatetimePicker',
    props: { visible: Boolean, modelValue: Number, minDate: Number, maxDate: Number, type: String },
    emits: ['update:visible', 'confirm'],
    setup: () => () => h('view'),
  }),
  'wd-search': defineComponent({
    props: { modelValue: String },
    emits: ['update:modelValue', 'search', 'clear'],
    setup(props, { emit, attrs }) {
      return () =>
        h('input', {
          ...attrs,
          value: props.modelValue,
          onInput: (event: Event) =>
            emit('update:modelValue', (event.target as HTMLInputElement).value),
        })
    },
  }),
}
