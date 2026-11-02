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
  /** 読むだけ(シンプルな制作の画面の「HTML」の欄。書き換えられない) */
  readOnly?: boolean
  /** この文字の、最初の場所を選んで見える所まで送る(プレビューで押した部品の、HTML の中の場所。2026-11-02 利用者) */
  reveal?: string
}

/**
 * HTML のエディタ(制作のページ。2026-10-19、利用者と決めた: 左で直して、右のプレビューにすぐ反映)。
 * 色分け・行番号・字下げのある、軽いコードエディタ(CodeMirror)。部品が大きいので、開いたときに読み込む(最初の画面を重くしない)
 */
export function HtmlEditor({ value, onChange, ariaLabel, readOnly, reveal }: Props) {
  const s = useStyles()
  const host = useRef<HTMLDivElement>(null)
  // エディタの本体と、最新の onChange(作り直さずに差し替える)
  const view = useRef<{ setDoc: (v: string) => void; current: () => string; destroy: () => void; reveal: (text: string) => void } | null>(null)
  // エディタを作り終える前に来た「この場所へ」(作り終えたら送る)
  const pending = useRef<string | undefined>(reveal)
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
          ...(readOnly ? [EditorView.editable.of(false)] : []),
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
        // 文字を探して、その場所を選び、見える所まで送る(見つからなければ何もしない)
        reveal: (text) => {
          const at = ev.state.doc.toString().indexOf(text)
          if (at >= 0) ev.dispatch({ selection: { anchor: at, head: at + text.length }, effects: EditorView.scrollIntoView(at, { y: 'center' }) })
        },
      }
      if (pending.current) view.current.reveal(pending.current)
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

  useEffect(() => {
    pending.current = reveal
    if (reveal) view.current?.reveal(reveal)
  }, [reveal, value])

  return <div ref={host} className={s.root} />
}
