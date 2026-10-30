import { useEffect, useState } from 'react'
import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  SearchBox,
  Spinner,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import { ArrowLeftRegular, PlayRegular} from '@fluentui/react-icons'
import { RunApi, bytesLabel, isFailure, type RunEntry } from './api'
import { CopyButton } from './CopyButton'

const useStyles = makeStyles({
  body: { display: 'grid', gridTemplateColumns: '360px minmax(0, 1fr)', gap: '12px', minHeight: '60vh' },
  list: { display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto', maxHeight: '64vh', borderRight: `1px solid ${tokens.colorNeutralStroke2}`, paddingRight: '8px' },
  item: { border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', padding: '4px 6px', borderRadius: tokens.borderRadiusMedium, display: 'flex', flexDirection: 'column', gap: '2px', color: tokens.colorNeutralForeground1, ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  itemOn: { backgroundColor: tokens.colorBrandBackground2 },
  head: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  first: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  detail: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 },
  row: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  facts: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  pre: { margin: 0, fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '50vh', overflowY: 'auto', padding: '8px', backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium },
  error: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  muted: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
})

const SOURCE_COLOR = { 画面: 'brand', AI: 'informative', 列を調べる: 'subtle' } as const
const usd = (v: number | null) => (v == null ? '' : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`)

/** 実行の履歴(画面・AI・列を調べる、で流した SQL。成功も失敗も)。開いて、欄に入れる・入れて流す・コピー */
export function HistoryDialog({ open, onClose, onUseSql }: { open: boolean; onClose: () => void; onUseSql: (sql: string, run: boolean) => void }) {
  const s = useStyles()
  const [q, setQ] = useState('')
  const [runs, setRuns] = useState<RunEntry[] | null>(null)
  const [current, setCurrent] = useState<RunEntry | null>(null)

  useEffect(() => {
    if (!open) return
    // 打つたびに読まない(少し待ってから)
    const id = window.setTimeout(() => {
      void RunApi.history(q).then((r) => {
        if (isFailure(r)) return setRuns([])
        setRuns(r.runs)
        setCurrent((c) => (c && r.runs.some((x) => x.id === c.id) ? c : r.runs[0] ?? null))
      })
    }, 250)
    return () => window.clearTimeout(id)
  }, [open, q])

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: '1100px', width: '94vw' }}>
        <DialogBody>
          <DialogTitle>実行の履歴</DialogTitle>
          <DialogContent>
            <div className={s.row} style={{ marginBottom: '8px' }}>
              <SearchBox size="small" style={{ minWidth: '320px' }} value={q} placeholder="SQL・エラーの文字で探す(表の名前 など)" onChange={(_, d) => setQ(d.value)} />
              <span className={s.muted}>画面で流したもの・AI が値を確認するために流したもの・列を調べたものが、成功も失敗も残ります(Workbench の server/devwork/history.jsonl)。</span>
            </div>
            {!runs ? (
              <Spinner size="tiny" />
            ) : (
              <div className={s.body}>
                <div className={s.list}>
                  {runs.length === 0 && <span className={s.muted}>{q ? '当てはまる実行がありません' : 'まだ流した SQL はありません'}</span>}
                  {runs.map((r) => (
                    <button key={r.id} type="button" className={mergeClasses(s.item, current?.id === r.id && s.itemOn)} onClick={() => setCurrent(r)}>
                      <span className={s.head}>
                        <Badge size="small" appearance="tint" color={SOURCE_COLOR[r.source as keyof typeof SOURCE_COLOR] ?? 'informative'}>
                          {r.source}
                        </Badge>
                        {!r.ok && (
                          <Badge size="small" appearance="filled" color="danger">
                            エラー
                          </Badge>
                        )}
                        {new Date(r.at).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'medium' })}
                        {r.ok && r.rows != null && `・${r.rows.toLocaleString()} 行`}
                      </span>
                      <span className={s.first}>{r.sql.replace(/\s+/g, ' ').trim()}</span>
                    </button>
                  ))}
                </div>
                {current && (
                  <div className={s.detail}>
                    <div className={s.row}>
                      <Button size="small" appearance="primary" icon={<PlayRegular />} onClick={() => { onUseSql(current.sql, true); onClose() }} disabled={current.source === '列を調べる'}>
                        入れて流す
                      </Button>
                      <Button size="small" icon={<ArrowLeftRegular />} onClick={() => { onUseSql(current.sql, false); onClose() }}>
                        欄に入れる
                      </Button>
                      <CopyButton text={() => current.sql} />
                    </div>
                    <span className={s.facts}>
                      {new Date(current.at).toLocaleString('ja-JP')}・{current.source}
                      {current.ok
                        ? `・${current.rows?.toLocaleString() ?? '?'} 行・処理 ${bytesLabel(current.processed)}${current.billed != null ? `・課金 ${bytesLabel(current.billed)} ${usd(current.cost_usd)}` : ''}${current.seconds != null ? `・${current.seconds} 秒` : ''}`
                        : ''}
                    </span>
                    {current.error && <div className={s.error}>{current.error}</div>}
                    <pre className={s.pre}>{current.sql}</pre>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>閉じる</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
