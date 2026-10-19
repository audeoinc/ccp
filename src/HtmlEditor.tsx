import { useEffect, useRef } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'

const useStyles = makeStyles({
  // 高さはペインいっぱい。エディタの中でスクロールする
  root: {
    height: '100%',
    minHeight: 0,
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
  ariaLabel?: string
}

/**
 * HTML のエディタ(制作のページ。2026-10-19、利用者と決めた: 左で直して、右のプレビューにすぐ反映)。
 * 色分け・行番号・字下げのある、軽いコードエディタ(CodeMirror)。部品が大きいので、開いたときに読み込む(最初の画面を重くしない)
 */
export function HtmlEditor({ value, onChange, ariaLabel }: Props) {
  const s = useStyles()
  const host = useRef<HTMLDivElement>(null)
  // エディタの本体と、最新の onChange(作り直さずに差し替える)
  const view = useRef<{ setDoc: (v: string) => void; current: () => string; destroy: () => void } | null>(null)
  const change = useRef(onChange)
  useEffect(() => {
    change.current = onChange
  }, [onChange])

  useEffect(() => {
    let alive = true
    void (async () => {
      const [{ EditorView, basicSetup }, { html }] = await Promise.all([import('codemirror'), import('@codemirror/lang-html')])
      if (!alive || !host.current) return
      const ev = new EditorView({
        doc: value,
        parent: host.current,
        extensions: [
          basicSetup,
          html(),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) change.current(u.state.doc.toString())
          }),
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel ?? 'HTML' }),
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
    // エディタは 1 回だけ作る(値の差し替えは、下の effect で行う)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 外から値が変わったとき(「プレビューから作り直す」・別の版を開いた)だけ、エディタの中身を差し替える
  useEffect(() => {
    const v = view.current
    if (v && v.current() !== value) v.setDoc(value)
  }, [value])

  return <div ref={host} className={s.root} />
}
