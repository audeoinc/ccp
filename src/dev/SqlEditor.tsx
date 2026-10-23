import { useEffect, useRef } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'

const useStyles = makeStyles({
  root: {
    height: '100%',
    minHeight: '160px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground1,
    '& .cm-editor': { height: '100%', fontSize: tokens.fontSizeBase200 },
    '& .cm-scroller': { fontFamily: tokens.fontFamilyMonospace },
  },
})

/** 入力補完に使う、表と列の一覧(画面が持っているもの) */
export interface SqlCatalog {
  /** 表(`プロジェクト.データセット.表`)。開いているデータセットの表 */
  tables: { ref: string; type: string }[]
  /** 列。SQL に書いた表と、開いている表の列 */
  columns: { name: string; type: string; table: string; description?: string }[]
}

interface Props {
  value: string
  onChange: (value: string) => void
  /** Ctrl + Enter(Mac は ⌘ + Enter)で呼ぶ(流す) */
  onRun?: () => void
  /** 選んでいる文字(選んでいなければ空)。「選んだ部分を流す」のため */
  onSelection?: (text: string) => void
  /** 入力補完の候補(打つたびに呼ぶので、画面が持っているものを返すだけにする) */
  catalog?: () => SqlCatalog
}

type Ctx = { matchBefore: (r: RegExp) => { from: number; to: number; text: string } | null; explicit: boolean }

/**
 * 表と列の入力補完。`プ` と打てば表の候補、別名の後ろの「.」で列の候補。
 * SQL のキーワードの補完(lang-sql)は、そのまま残る(候補が足される)
 */
function completeFrom(catalog: () => SqlCatalog) {
  return (ctx: Ctx) => {
    const word = ctx.matchBefore(/[`\w.$-]+/)
    if (!word || (word.from === word.to && !ctx.explicit)) return null
    const c = catalog()
    const text = word.text
    const dot = text.lastIndexOf('.')
    // `p.d.` のように、表の場所を打っている途中なら、表だけを出す
    if (text.startsWith('`') || (text.match(/\./g)?.length ?? 0) >= 2) {
      return {
        from: word.from,
        options: c.tables.map((t) => ({ label: `\`${t.ref}\``, type: 'class', detail: t.type === 'VIEW' ? 'ビュー' : '表' })),
        validFor: /^[`\w.$-]*$/,
      }
    }
    const columns = c.columns.map((col) => ({ label: col.name, type: 'property', detail: `${col.type}・${col.table.split('.').pop()}`, info: col.description || undefined }))
    // a.co のように、別名の後ろなら、「.」の後ろだけを置き換える
    if (dot >= 0) return { from: word.from + dot + 1, options: columns, validFor: /^[\w$]*$/ }
    const tables = c.tables.map((t) => ({ label: t.ref.split('.').pop() ?? t.ref, apply: `\`${t.ref}\``, type: 'class', detail: t.type === 'VIEW' ? 'ビュー' : '表' }))
    return { from: word.from, options: [...columns, ...tables], validFor: /^[\w$]*$/ }
  }
}

/**
 * SQL のエディタ(開発用の画面)。色分け・行番号・括弧の対応のある CodeMirror(HtmlEditor と同じ作り)。
 * 外から value が変わったとき(版を開いた・Gemini の案を入れた)は、中身を差し替える
 */
export function SqlEditor({ value, onChange, onRun, onSelection, catalog }: Props) {
  const s = useStyles()
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<{ setDoc: (v: string) => void; current: () => string; destroy: () => void } | null>(null)
  const change = useRef(onChange)
  const run = useRef(onRun)
  const selection = useRef(onSelection)
  const cat = useRef(catalog)
  useEffect(() => {
    change.current = onChange
    run.current = onRun
    selection.current = onSelection
    cat.current = catalog
  }, [onChange, onRun, onSelection, catalog])

  useEffect(() => {
    let alive = true
    void (async () => {
      const [{ EditorView, basicSetup }, { sql, StandardSQL }] = await Promise.all([import('codemirror'), import('@codemirror/lang-sql')])
      if (!alive || !host.current) return
      const ev = new EditorView({
        doc: value,
        parent: host.current,
        extensions: [
          EditorView.domEventHandlers({
            keydown: (e) => {
              if (!(e.ctrlKey || e.metaKey) || e.key !== 'Enter') return false
              e.preventDefault()
              run.current?.()
              return true
            },
          }),
          basicSetup,
          // BigQuery の方言は CodeMirror にないので、標準の SQL で色分けする(書き方の違いは、試しの dry-run が見つける)
          sql({ dialect: StandardSQL }),
          // 表と列の入力補完(キーワードの補完に足す)
          StandardSQL.language.data.of({ autocomplete: completeFrom(() => cat.current?.() ?? { tables: [], columns: [] }) }),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) change.current(u.state.doc.toString())
            if (u.selectionSet || u.docChanged) {
              const r = u.state.selection.main
              selection.current?.(r.empty ? '' : u.state.sliceDoc(r.from, r.to))
            }
          }),
          EditorView.contentAttributes.of({ 'aria-label': 'SQL' }),
        ],
      })
      view.current = {
        setDoc: (v) => ev.dispatch({ changes: { from: 0, to: ev.state.doc.length, insert: v } }),
        current: () => ev.state.doc.toString(),
        destroy: () => ev.destroy(),
      }
    })()
    return () => {
      alive = false
      view.current?.destroy()
      view.current = null
    }
    // エディタは 1 度だけ作る(中身の差し替えは、下の effect)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (view.current && view.current.current() !== value) view.current.setDoc(value)
  }, [value])

  return <div ref={host} className={s.root} />
}
