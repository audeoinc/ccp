import type { ReactNode } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'
import { Linkify } from './LinkText'

const useStyles = makeStyles({
  root: { fontSize: tokens.fontSizeBase200, lineHeight: '20px', color: tokens.colorNeutralForeground1, minWidth: 0 },
  h: { fontWeight: tokens.fontWeightSemibold, margin: '6px 0 2px', ':first-child': { marginTop: 0 } },
  p: { margin: '0 0 4px' },
  list: { margin: '0 0 4px', paddingLeft: '20px' },
})

// **太字** だけを読む(制作指示の案で使う書式は、見出し・箇条書き・太字だけ)。中の URL は押して開ける
const inline = (text: string): ReactNode[] =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}><Linkify text={part.slice(2, -2)} /></strong> : <Linkify key={i} text={part} />))

/**
 * Markdown(見出し ###、箇条書き -、番号つき 1.、太字 **)の簡易表示。AI の案のカードで使う(読むだけ)。
 * 入力は NotesEditor(TipTap)。表示だけのために、エディタを何個も立ち上げないよう、ここで軽く描く。
 */
export function MarkdownLite({ text }: { text: string }) {
  const styles = useStyles()
  const out: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    out.push(
      <Tag key={out.length} className={styles.list}>
        {list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}
      </Tag>,
    )
    list = null
  }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    const num = line.match(/^\s*\d+[.)]\s+(.*)$/)
    const head = line.match(/^#{1,6}\s+(.*)$/)
    if (bullet || num) {
      const ordered = !!num
      if (list && list.ordered !== ordered) flush()
      list ??= { ordered, items: [] }
      list.items.push((bullet ?? num)![1])
      continue
    }
    flush()
    if (head) out.push(<div key={out.length} className={styles.h}>{inline(head[1])}</div>)
    else if (line.trim()) out.push(<p key={out.length} className={styles.p}>{inline(line)}</p>)
  }
  flush()
  return <div className={styles.root}>{out}</div>
}
