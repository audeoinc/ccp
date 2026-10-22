import { makeStyles, tokens } from '@fluentui/react-components'
import type { Column, Row } from './api'
import { CopyButton } from './CopyButton'
import { cellText, toMarkdown, toTsv } from './format'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 },
  bar: { display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, marginRight: 'auto' },
  scroll: {
    overflow: 'auto',
    maxHeight: '420px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  table: { borderCollapse: 'collapse', fontSize: tokens.fontSizeBase200, fontFamily: tokens.fontFamilyMonospace },
  th: {
    position: 'sticky',
    top: 0,
    backgroundColor: tokens.colorNeutralBackground3,
    textAlign: 'left',
    padding: '4px 8px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    whiteSpace: 'nowrap',
    fontWeight: tokens.fontWeightSemibold,
  },
  type: { display: 'block', fontWeight: tokens.fontWeightRegular, color: tokens.colorNeutralForeground3 },
  td: { padding: '3px 8px', borderBottom: `1px solid ${tokens.colorNeutralStroke3}`, whiteSpace: 'nowrap', maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'top' },
  null: { color: tokens.colorNeutralForeground4, fontStyle: 'italic' },
})

interface Props {
  columns: Column[]
  rows: Row[]
  /** 表の上の説明(何行のうち何行か など) */
  note?: string
}

/** 問い合わせの結果の表。TSV(スプレッドシートに貼る)と Markdown(Gemini・Claude に貼る)で写せる */
export function ResultGrid({ columns, rows, note }: Props) {
  const s = useStyles()
  return (
    <div className={s.root}>
      <div className={s.bar}>
        <span className={s.note}>{note ?? `${rows.length} 行`}</span>
        <CopyButton label="TSV でコピー" title="スプレッドシートにそのまま貼れる形(タブ区切り)" text={() => toTsv(columns, rows)} />
        <CopyButton label="Markdown でコピー" title="Gemini・Claude に貼る形" text={() => toMarkdown(columns, rows)} />
      </div>
      <div className={s.scroll}>
        <table className={s.table}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.name} className={s.th}>
                  {c.name}
                  <span className={s.type}>{c.type}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => {
                  const v = r[c.name]
                  const text = cellText(v)
                  return (
                    <td key={c.name} className={s.td} title={text}>
                      {v == null ? <span className={s.null}>NULL</span> : text}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
