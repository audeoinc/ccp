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

interface Props {
  value: string
  onChange: (value: string) => void
  /** Ctrl + Enter(Mac は ⌘ + Enter)で呼ぶ(流す) */
  onRun?: () => void
}

/**
 * SQL のエディタ(開発用の画面)。色分け・行番号・括弧の対応のある CodeMirror(HtmlEditor と同じ作り)。
 * 外から value が変わったとき(版を開いた・Gemini の案を入れた)は、中身を差し替える
 */
export function SqlEditor({ value, onChange, onRun }: Props) {
  const s = useStyles()
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<{ setDoc: (v: string) => void; current: () => string; destroy: () => void } | null>(null)
  const change = useRef(onChange)
  const run = useRef(onRun)
  useEffect(() => {
    change.current = onChange
    run.current = onRun
  }, [onChange, onRun])

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
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) change.current(u.state.doc.toString())
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
