<script lang="ts">
import { defineComponent, PropType, ref, watch, h, VNode, resolveDirective, withDirectives } from 'vue'
import { ElInput, ElCheckbox, ElInputNumber, ElButtonGroup, ElButton, ElSelect, ElOption, ElTooltip } from 'element-plus'
import { FormField } from './typings'

const adjustValue = (v: any, t: string, f: FormField) => {
  if (typeof v === 'undefined') return undefined
  switch(t) {
    case 'string':
      return String(v)
    case 'number':
      return Number(v)
    case 'boolean':
      return Boolean(v)
    default:
      // union
      if (f.enums && f.enums.length) {
        return f.enums[0]
      }
      return undefined
  }
}

export default defineComponent({
  props: {
    fields: {
      type: Array as PropType<FormField[]>,
      required: true,
    },
    loading: Boolean,
  },
  emits: [],
  setup(props, { emit }){
    const json = ref<Record<string, any>>({})
    const keySeed = ref(1)

    watch(() => props.fields, fs => {
      fs.forEach(field => {
        if (field.prop in json.value) {
          json.value[field.prop] = adjustValue(json.value[field.prop], field.type, field)
        } else if ('default' in field) {
          json.value[field.prop] = field.default
        } else {
          json.value[field.prop] = undefined
        }
      })
      keySeed.value++
    }, { immediate: true })

    const onPropUpdate = (key: string, value: any) => {
      json.value[key] = value
    }

    const renderField = (f: FormField): VNode => {
      if (f.type === 'union') {
        const enums = f.enums || []
        if (enums.length <= 5) {
          return h(ElButtonGroup, {}, {
            default: () => enums.map(e => {
              return h(ElButton, {
                type: e === json.value[f.prop] ? 'primary' : undefined,
                onClick: () => onPropUpdate(f.prop, e),
              }, { default: () => String(e) })
            })
          })
        } else {
          return h(ElSelect, {
            defaultValue: f.default,
            modelValue: json.value[f.prop],
            'onUpdate:modelValue': (v: any) => onPropUpdate(f.prop, v),
          }, {
            default: () => enums.map(e => {
              return h(ElOption, {
                label: String(e),
                value: e,
              })
            })
          })
        }
      }
      const Component = [ElInput, ElInputNumber, ElCheckbox][['string', 'number', 'boolean'].indexOf(f.type)]
      return h(Component, {
        modelValue: json.value[f.prop],
        'onUpdate:modelValue': (v: any) => onPropUpdate(f.prop, v),
        defaultValue: f.default,
      })
    }

    const renderOptionalTag = (field: FormField) => {
      if (!field.desc) return null
      return h(ElTooltip, {
        placement: 'top-end',
        content: field.desc,
      }, {
        default: () => h('i', { class: 'el-icon-warning-outline icon' })
      })
    }

    const loadingDirective = resolveDirective('loading')

    return () => {
      const table = h('table', { key: keySeed.value }, h('tbody', null, {
        default: () => props.fields.map(field => {
          return h('tr', { class: 'row', key: field.prop }, [
            h('td', { class: {
              label: true,
              required: field.required,
            } }, h('span', field.label || field.prop)),
            h('td', { class: 'field' }, {
              default: () => [renderField(field), renderOptionalTag(field)]
            }),
          ])
        })
      }))
      return withDirectives(h('div', { class: 'form' }, table), [
        [loadingDirective!, props.loading]
      ])
    }
  }
})
</script>

<style lang="scss" scoped>
.form {
  padding-top: 20px;
  width: 100%;
  height: 100%;
}

.row {
  td {
    padding: 10px;
  }
}

td.label {
  text-align: right;
  padding-left: 40px;
  &.required {
    span {
      position: relative;
      &::before {
        content: '*';
        color: red;
        position: absolute;
        left: -14px;
      }
    }
  }
}

.icon {
  margin-left: 8px;
  cursor: pointer;
  color: #888;
}

</style>