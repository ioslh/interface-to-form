<template>
  <div class="page">
    <header class="header">interface to form</header>
    <main class="main">
      <div class="editor" ref="container"></div>
      <div class="right">
        <ts-form :fields="fields" />
      </div>
    </main>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref, onBeforeUnmount, watch, computed } from 'vue'
import monacoLoader from '@monaco-editor/loader'
import type Monaco from 'monaco-editor'
import type ts from 'typescript'
import TsForm from './form.vue'
import { FormField } from './typings'

type ReturnPromisify<F extends Function> =
  F extends (a: infer A) => infer T
    ? (a: A) => Promise<T>
    : F extends (a: infer A, b: infer B) => infer T
      ? (a: A, b: B) => Promise<T>
      : F extends (a: infer A, b: infer B, c: infer C) => infer T
        ? (a: A, b: B, c: C) => Promise<T>
        : F extends (a: infer A, b: infer B, c: infer C, d: infer D) => infer T
          ? (a: A, b: B, c: C, d: D) => Promise<T>
          : F extends (a: infer A, b: infer B, c: infer C, d: infer D, e: infer E) => infer T
            ? (a: A, b: B, c: C, d: D, e: E) => Promise<T>
            : Function


let syntaxKind: typeof ts.SyntaxKind

let monaco: typeof Monaco
let monacoPromise: Promise<typeof Monaco>
const monacoGetter = () => {
  if (monaco) return Promise.resolve(monaco)
  if (monacoPromise) return monacoPromise
  // const segment = process.env.NODE_ENV === 'development' ? 'dev' : 'min'
  const segment = 'dev'
  monacoLoader.config({
    paths: {
      vs: `/monaco-editor/${segment}/vs`
    }
  })
  return monacoPromise = monacoLoader.init().then((result) => {
    monaco = result
    // https://microsoft.github.io/monaco-editor/playground.html#extending-language-services-configure-javascript-defaults
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false
    })
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      allowJs: true,
      target: monaco.languages.typescript.ScriptTarget.ES2016,
      allowNonTsExtensions: true,
      checkJs: true,
      noLib: true,
      lib: ['ES5', 'ES2015', 'ESNext']
    })
    return monaco
  })
}

interface HackedTsWorker extends Monaco.languages.typescript.TypeScriptWorker {
  createSourceFile: ReturnPromisify<typeof ts["createSourceFile"]>
  getSyntaxKind: () => Promise<typeof ts.SyntaxKind>
}

let tsWorker: HackedTsWorker
let tsWorkerPromise: Promise<void> | undefined
const tsWorkerGetter = (monaco: typeof Monaco): Promise<void> => {
  if (tsWorker) return Promise.resolve()
  if (tsWorkerPromise) return tsWorkerPromise
  return tsWorkerPromise = new Promise((resolve, reject) => {
    monaco.languages.typescript.getTypeScriptWorker().then(workerGetter => {
      workerGetter().then(worker => {
        tsWorker = worker as HackedTsWorker
        resolve()
      }).catch(() => {
        tsWorkerPromise = undefined
        reject()
      })
    }).catch(() => {
      tsWorkerPromise = undefined
      reject()
    })
  })
}
let editor: Monaco.editor.IStandaloneCodeEditor | null = null

const initCode = `interface Form {
  /** @label 姓名 */
  /** @default 张三 */
  name: string
  /** @label 年龄 */
  /** @default 5 */
  age: number
  /** @label 性别 */
  /** @default female */
  gender?: "male" | "female"
  /** @label 是否注册 */
  /** @desc 一些描述信息 */
  /** @default true */
  signed?: boolean
}`

const makeValue = (v: any, type: ts.SyntaxKind) => {
  switch(type) {
    case syntaxKind.StringKeyword:
    case syntaxKind.StringLiteral:
      return String(v)
    case syntaxKind.NumberKeyword:
    case syntaxKind.NumericLiteral:
      return Number(v)
    case syntaxKind.BooleanKeyword:
    case syntaxKind.TrueKeyword:
    case syntaxKind.FalseKeyword:
      return Boolean(v)
  }
  return v
}

const normalizeStringLiteral = (v: string): any => {
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^-?\d*(\.\d*)?$/.test(v)) return Number(v)
  return String(v)
}

export default defineComponent({
  components: {
    TsForm
  },
  setup() {
    const code = ref(initCode)
    const container = ref<HTMLElement>()
    const timer = ref()
    const fields = ref<FormField[]>([])

    onMounted(() => {
      monacoGetter().then(() => {
        editor = monaco.editor.create(container.value!, {
          value: code.value,
          language: 'typescript',
          theme: 'vs-light',
          automaticLayout: true,
          fontSize: 14,
          lineHeight: 20,
          fixedOverflowWidgets: true,
          scrollbar: {
            verticalScrollbarSize: 4
          }
        })
        editor.onDidChangeModelContent(() => {
          if (editor) {
            code.value = editor.getValue()
            // emit('update:modelValue', code)
            // tsWorkerGetter(monaco).then(() => {
            //   tsWorker.createSourceFile('form.ts', code, monaco.languages.typescript.ScriptTarget.ESNext)
            //     .then(sf => {
            //       console.log(sf.statements)
            //     })
            // })
            // monaco.languages.typescript.getTypeScriptWorker().then(workerGetter => {
            //   const uri = editor?.getModel()?.uri
            //   if (uri) {
            //     workerGetter(uri).then(worker => {
            //       worker.getEmitOutput(uri.toString()).then(output => {
            //         console.log(output)
            //       })
            //     })
            //   }
            // })
          }
        })
      })
    })

    const interfaceToJson = async (content: string) => {
      await monacoGetter()
      await tsWorkerGetter(monaco)
      if (!syntaxKind) {
        syntaxKind = await tsWorker.getSyntaxKind()
      }
      const sf = await tsWorker!.createSourceFile('form.ts', content, monaco.languages.typescript.ScriptTarget.ESNext)
      // console.log(sf.statements)
      sf.statements.forEach(statement => {
        switch(statement.kind) {
          case syntaxKind.InterfaceDeclaration:
            if ((statement as any).name.escapedText === 'Form') {
              receiveInterface(statement as ts.InterfaceDeclaration)
            }
        }
      })
    }

    const whiteListJsDocTags = ['label', 'desc', 'default'] as Array<keyof FormField>
    const receiveInterface = (statement: ts.InterfaceDeclaration) => {
      const fs: FormField[] = []
      statement.members.forEach(member => {
        if (member.kind !== syntaxKind.PropertySignature) return
        const anyMember = member as any
        const field: Partial<FormField> = { prop: anyMember.name.escapedText }
        if (anyMember.questionToken) {
          field.required = false
        } else {
          field.required = true
        }
        if (anyMember.type) {
          switch(anyMember.type.kind) {
            case syntaxKind.StringKeyword:
              field.type = 'string'
              break
            case syntaxKind.NumberKeyword:
              field.type = 'number'
              break
            case syntaxKind.BooleanKeyword:
              field.type = 'boolean'
              break
            case syntaxKind.UnionType:
              field.type = 'union'
              field.enumerable = true
              if (anyMember.type && anyMember.type.types) {
                field.enums = []
                anyMember.type.types.map((t: any) => {
                  if (t.kind === syntaxKind.LiteralType) {
                    field.enums!.push(makeValue(t.literal.text, t.literal.kind))
                  }
                })
              }
          }
        }

        if (anyMember.jsDoc && anyMember.jsDoc.length) {
          anyMember.jsDoc.forEach((jsdoc: any) => {
            if (jsdoc.kind === syntaxKind.JSDocComment && jsdoc.tags && jsdoc.tags.length) {
              jsdoc.tags.forEach((tag: any) => {
                if (tag.kind === syntaxKind.JSDocTag) {
                  const name = tag.tagName.escapedText
                  if (whiteListJsDocTags.includes(name)) {
                    if (name === 'default') {
                      let defaultValue = makeValue(tag.comment, anyMember.type.kind)
                      if (field.type === 'union') {
                        defaultValue = normalizeStringLiteral(defaultValue)
                        if ((field.enums || []).includes(defaultValue)) {
                          field.default = defaultValue
                        }
                      } else {
                        field.default = defaultValue
                      }
                    } else {
                      field[name as keyof FormField] = tag.comment
                    }
                  }
                }
              })
            }
          })
        }
        fs.push(field as FormField)
      })
      fields.value = fs
    }

    watch(code, content => {
      clearTimeout(timer.value)
      timer.value = setTimeout(() => {
        interfaceToJson(content)
      }, 500)
    }, { immediate: true })

    onBeforeUnmount(() => {
      editor && editor.dispose()
    })

    return {
      fields,
      container,
    }
  }
})
</script>

<style>
@font-face{
  font-family:JetBrains Mono-Regular;
  src:url("/fonts/JetBrainsMono-Regular.woff2") format("woff2");
}
* {
  margin: 0;
  padding: 0;
}
header, main, div, section {
  box-sizing: border-box;
}
</style>

<style lang="scss" scoped>
.page {
  height: 100vh;
  width: 100vw;
  font-family: "JetBrains Mono-Regular",Menlo,Monaco,Consolas,monospace;
}

.header {
  height: 36px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #fafafa;
  box-shadow: 0 0 5px 5px #fafafa;
}

.main {
  height: calc(100vh - 36px);
  display: flex;
}

.editor {
  width: 50%;
  height: 100%;
  border-right: 1px solid #eee;
}

.right {
  width: 50%;
  height: 100%;
  position: relative;
}
</style>