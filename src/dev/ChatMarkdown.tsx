import type { ReactNode } from 'react'
import { Button, makeStyles, tokens } from '@fluentui/react-components'
import { ArrowLeftRegular, PlayRegular, SaveRegular } from '@fluentui/react-icons'
import { CopyButton } from './CopyButton'

const useStyles = makeStyles({
  root: { fontSize: tokens.fontSizeBase200, lineHeight: '20px', color: tokens.colorNeutralForeground1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' },
  h: { fontWeight: tokens.fontWeightSemibold, margin: '6px 0 0' },
  p: { margin: 0, overflowWrap: 'anywhere' },
  list: { margin: 0, paddingLeft: '20px' },
  code: { fontFamily: tokens.fontFamilyMonospace, fontSize: '0.95em', backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusSmall, padding: '0 3px', overflowWrap: 'anywhere' },
  block: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, overflow: 'hidden' },
  blockHead: { display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', backgroundColor: tokens.colorNeutralBackground3, flexWrap: 'wrap' },
  lang: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, flexGrow: 1 },
  pre: { margin: 0, padding: '8px', fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '320px', overflowY: 'auto' },
  tableWrap: { overflowX: 'auto' },
  table: { borderCollapse: 'collapse', fontSize: tokens.fontSizeBase200 },
  th: { textAlign: 'left', padding: '3px 8px', borderBottom: `1px solid ${tokens.colorNeutralStroke1}`, backgroundColor: tokens.colorNeutralBackground3, fontWeight: tokens.fontWeightSemibold, verticalAlign: 'top' },
  td: { padding: '3px 8px', borderBottom: `1px solid ${tokens.colorNeutralStroke3}`, verticalAlign: 'top' },
})

interface Props {
  text: string
  /** SQL のブロックを、SQL の欄に入れる(run なら、入れてすぐ流す)。なければボタンを出さない */
  onUseSql?: (sql: string, run: boolean) => void
  /** SQL のブロックを、作業ファイルに保存する。なければボタンを出さない */
  onSaveSql?: (sql: string) => void
}

/**
 * AI の返事・思考の Markdown を表示する(開発用の画面)。
 * MarkdownLite(見出し・箇条書き・太字)に加えて、コードのブロック(```)・`コード`・表を読む。
 * SQL のブロックには、その場に「入れて流す」「欄に入れる」を付ける(返事の中に SQL がいくつあっても、どれを使うか迷わないように)
 */
export function ChatMarkdown({ text, onUseSql, onSaveSql }: Props) {
  const s = useStyles()

  // **太字** と `コード`
  const inline = (t: string): ReactNode[] =>
    t.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part, i) => {
      if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) return <code key={i} className={s.code}>{part.slice(1, -1)}</code>
      if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{inline(part.slice(2, -2))}</strong>
      return part
    })

  const out: ReactNode[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  let para: string[] = []
  const flushPara = () => {
    if (!para.length) return
    out.push(
      <p key={out.length} className={s.p}>
        {para.flatMap((l, j) => (j ? [<br key={`b${j}`} />, ...inline(l)] : inline(l)))}
      </p>,
    )
    para = []
  }
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

  while (i < lines.length) {
    const line = lines[i]
    const fence = line.match(/^\s*```\s*([\w-]*)\s*$/)
    if (fence) {
      flushPara()
      const lang = fence[1].toLowerCase()
      const body: string[] = []
      i++
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++])
      i++ // 閉じの ```(なくても、最後までをブロックにする)
      const code = body.join('\n')
      const isSql = lang === 'sql' || (!lang && /^\s*(with|select)\b/i.test(code))
      out.push(
        <div key={out.length} className={s.block}>
          <div className={s.blockHead}>
            <span className={s.lang}>{lang || (isSql ? 'sql' : 'コード')}</span>
            {isSql && onUseSql && (
              <>
                <Button size="small" appearance="primary" icon={<PlayRegular />} onClick={() => onUseSql(code, true)} title="SQL の欄に入れて、すぐ流す(SELECT だけ)">
                  入れて流す
                </Button>
                <Button size="small" icon={<ArrowLeftRegular />} onClick={() => onUseSql(code, false)}>
                  欄に入れる
                </Button>
              </>
            )}
            {isSql && onSaveSql && (
              <Button size="small" appearance="subtle" icon={<SaveRegular />} onClick={() => onSaveSql(code)} title="作業ファイルに .sql で保存">
                保存
              </Button>
            )}
            <CopyButton text={() => code} />
          </div>
          <pre className={s.pre}>{code}</pre>
        </div>,
      )
      continue
    }
    // 表(| a | b | の行の次が |---|---|)
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flushPara()
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]))
      out.push(
        <div key={out.length} className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                {head.map((h, j) => (
                  <th key={j} className={s.th}>
                    {inline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, j) => (
                <tr key={j}>
                  {head.map((_, k) => (
                    <td key={k} className={s.td}>
                      {inline(r[k] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }
    const h = line.match(/^\s*#{1,6}\s+(.*)$/)
    if (h) {
      flushPara()
      out.push(
        <div key={out.length} className={s.h}>
          {inline(h[1])}
        </div>,
      )
      i++
      continue
    }
    const li = line.match(/^\s*(?:[-*]|(\d+)\.)\s+(.*)$/)
    if (li) {
      flushPara()
      const ordered = !!li[1]
      const items: string[] = []
      while (i < lines.length) {
        const m = lines[i].match(/^\s*(?:[-*]|(\d+)\.)\s+(.*)$/)
        if (!m || !!m[1] !== ordered) break
        items.push(m[2])
        i++
      }
      const Tag = ordered ? 'ol' : 'ul'
      out.push(
        <Tag key={out.length} className={s.list}>
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </Tag>,
      )
      continue
    }
    if (!line.trim()) flushPara()
    else para.push(line)
    i++
  }
  flushPara()
  return <div className={s.root}>{out}</div>
}
