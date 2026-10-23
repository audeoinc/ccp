import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Dropdown, Input, MessageBar, MessageBarBody, Option, Spinner, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { DatabaseRegular, PlayRegular, SearchRegular, TableRegular, EyeRegular, ArrowDownloadRegular, CheckmarkCircleRegular, PanelLeftContractRegular, PanelLeftExpandRegular, PanelRightExpandRegular, SparkleRegular, HistoryRegular } from '@fluentui/react-icons'
import { DevApi, bytesLabel, isFailure, type DryRun, type RunResult, type Settings, type TableInfo } from './api'
import { CopyButton } from './CopyButton'
import { ResultGrid } from './ResultGrid'
import { SqlEditor } from './SqlEditor'
import { toMarkdown } from './format'
import { TableDetail } from './TableDetail'
import { DatasetPicker } from './DatasetPicker'
import { ChatPanel } from './ChatPanel'
import { JobInfo } from './JobInfo'
import { WorkPanel } from './WorkPanel'
import { HistoryDialog } from './HistoryDialog'

const useStyles = makeStyles({
  // 左: データセットと表 / 中: 表の中身と SQL / 右: Gemini との会話(SQL を見ながら話せるように、並べて置く)
  root: { display: 'grid', columnGap: '2px', alignItems: 'start' },
  // ペインの境目(ドラッグで幅を変える)
  splitter: {
    alignSelf: 'stretch',
    cursor: 'col-resize',
    borderRadius: tokens.borderRadiusMedium,
    touchAction: 'none',
    ':hover': { backgroundColor: tokens.colorNeutralStroke2 },
  },
  side: { display: 'flex', flexDirection: 'column', gap: '8px', position: 'sticky', top: '12px', minWidth: 0 },
  // 畳んだペインの帯(押すと開く)
  folded: {
    position: 'sticky',
    top: '12px',
    height: 'calc(100vh - 80px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    paddingTop: '10px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    color: tokens.colorNeutralForeground2,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  foldedLabel: { writingMode: 'vertical-rl', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold },
  card: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minWidth: 0,
  },
  main: { display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 },
  heading: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, display: 'flex', alignItems: 'center', gap: '6px' },
  label: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  row: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  grow: { flexGrow: 1, minWidth: 0 },
  list: { display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 330px)', overflowY: 'auto', marginLeft: '-4px', marginRight: '-4px' },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px',
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    fontSize: tokens.fontSizeBase200,
    fontFamily: tokens.fontFamilyMonospace,
    border: 'none',
    background: 'none',
    textAlign: 'left',
    color: tokens.colorNeutralForeground1,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  itemOn: { backgroundColor: tokens.colorBrandBackground2, ':hover': { backgroundColor: tokens.colorBrandBackground2Hover } },
  itemName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1 },
  mono: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, overflowWrap: 'anywhere' },
  editor: { height: '260px', resize: 'vertical', overflow: 'hidden' },
  muted: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
})

// SQL の書きかけは、この画面を開いている人のブラウザにだけ残す(作業の記録は、版の保存で残す。DEVTOOLS.md 3.1)
const DRAFT_KEY = 'ccp-dev-sql-draft'
const readDraft = (): string => {
  try {
    return window.localStorage.getItem(DRAFT_KEY) ?? ''
  } catch {
    return ''
  }
}
const writeDraft = (v: string) => {
  try {
    window.localStorage.setItem(DRAFT_KEY, v)
  } catch {
    // 保存できない環境(プライベートの窓 など)では、残さない
  }
}

const ROW_CHOICES = [20, 200, 1000]

// ペインの幅と、開いているか(左: データセットと表 / 右: AI との会話。真ん中は残り。ただし 420px は残し、窓が狭ければ横にスクロール)。
// この画面を開いている人のブラウザに覚える
const WIDTHS = { left: 280, right: 460, leftOpen: true, rightOpen: true }
const WIDTHS_KEY = 'ccp-dev-layout'
// 畳んだペインの帯の幅
const FOLDED = 32
const readWidths = (): typeof WIDTHS => {
  try {
    const v = JSON.parse(window.localStorage.getItem(WIDTHS_KEY) ?? 'null') as Partial<typeof WIDTHS> | null
    return v && (v.left ?? 0) > 0 && (v.right ?? 0) > 0 ? { ...WIDTHS, ...v } : WIDTHS
  } catch {
    return WIDTHS
  }
}

function download(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function BqTab({ settings, onSettings }: { settings: Settings; onSettings: (s: Settings) => void }) {
  const s = useStyles()
  const [dataset, setDataset] = useState(settings.datasets?.[0] ?? '')
  const [tables, setTables] = useState<{ id: string; ref: string; type: string }[] | null>(null)
  const [tablesError, setTablesError] = useState('')
  const [loadingTables, setLoadingTables] = useState(false)
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [info, setInfo] = useState<TableInfo | null>(null)
  const [infoError, setInfoError] = useState('')
  const [busy, setBusy] = useState<'' | 'info' | 'dry' | 'run'>('')

  const [sql, setSql] = useState(readDraft)
  // 作る出力(SPU など)。版・答え合わせと、AI に渡す手本の SQL に使う
  const [output, setOutput] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  // AI に頼む(答え合わせの結果から)。id を変えて、同じ文でも送り直せるように
  const [ask, setAsk] = useState<{ id: number; text: string } | null>(null)
  const [widths, setWidths] = useState(readWidths)
  useEffect(() => {
    try {
      window.localStorage.setItem(WIDTHS_KEY, JSON.stringify(widths))
    } catch {
      // 覚えられない環境では、毎回既定の幅
    }
  }, [widths])

  /** 境目のドラッグ。左の境目は左のペイン、右の境目は右のペインの幅を変える(真ん中は残りを使う) */
  const drag = (e: React.PointerEvent<HTMLDivElement>, side: 'left' | 'right') => {
    e.preventDefault()
    const x0 = e.clientX
    const w0 = widths
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0
      if (side === 'left') setWidths({ ...w0, left: Math.min(Math.max(w0.left + dx, 200), 600) })
      else setWidths({ ...w0, right: Math.min(Math.max(w0.right - dx, 320), Math.round(window.innerWidth * 0.7)) })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const [maxRows, setMaxRows] = useState(200)
  const [dry, setDry] = useState<DryRun | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  const [sqlError, setSqlError] = useState('')

  const changeSql = useCallback((v: string) => {
    setSql(v)
    writeDraft(v)
  }, [])

  const openDataset = async (ds = dataset) => {
    const name = ds.trim().replace(/`/g, '')
    if (!name) return
    setDataset(name)
    setLoadingTables(true)
    setTablesError('')
    const r = await DevApi.tables(name)
    setLoadingTables(false)
    if (isFailure(r)) {
      setTables(null)
      setTablesError(r.error)
      return
    }
    setTables(r.tables)
    // よく見るデータセットとして、先頭に残す(最大 8 つ)
    const next = [name, ...(settings.datasets ?? []).filter((d) => d !== name)].slice(0, 8)
    if (next.join() !== (settings.datasets ?? []).join()) onSettings({ ...settings, datasets: next })
  }

  // 前回見たデータセットは、開いたときに読む
  useEffect(() => {
    if (!dataset) return
    const id = window.setTimeout(() => void openDataset(dataset))
    return () => window.clearTimeout(id)
    // 最初の 1 回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openTable = async (ref: string) => {
    setSelected(ref)
    setInfo(null)
    setInfoError('')
    setBusy('info')
    const r = await DevApi.table(ref)
    setBusy('')
    if (isFailure(r)) setInfoError(r.error)
    else setInfo(r)
  }

  const dryRun = async () => {
    if (!sql.trim()) return
    setBusy('dry')
    setSqlError('')
    const r = await DevApi.dryrun(sql)
    setBusy('')
    if (isFailure(r)) {
      setDry(null)
      setSqlError(r.error)
    } else setDry(r)
  }

  /** 流す。text を渡すと、それを流す(AI の返事の「入れて流す」。欄の中身が変わるのを待たずに) */
  const runSql = async (text = sql) => {
    if (!text.trim() || busy) return
    setBusy('run')
    setSqlError('')
    const r = await DevApi.run(text, maxRows)
    setBusy('')
    if (isFailure(r)) {
      setResult(null)
      setSqlError(r.error)
    } else {
      setResult(r)
      setDry(null)
    }
  }

  // AI に渡す「いまの SQL を流した結果」(エラー、または結果の先頭 20 行)
  const last = useMemo(() => {
    if (sqlError) return `エラー:\n${sqlError}`
    if (result) return `${result.total_rows ?? '?'} 行(先頭 ${Math.min(20, result.rows.length)} 行):\n\n${toMarkdown(result.columns, result.rows.slice(0, 20))}`
    return ''
  }, [sqlError, result])

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return (tables ?? []).filter((t) => !f || t.id.toLowerCase().includes(f))
  }, [tables, filter])

  return (
    <div
      className={s.root}
      style={{ gridTemplateColumns: `${widths.leftOpen ? widths.left : FOLDED}px 10px minmax(420px, 1fr) 10px ${widths.rightOpen ? widths.right : FOLDED}px` }}
    >
      {!widths.leftOpen && (
        <button type="button" className={s.folded} onClick={() => setWidths((w) => ({ ...w, leftOpen: true }))} title="データセットと表を開く">
          <PanelLeftExpandRegular />
          <span className={s.foldedLabel}>データセット</span>
        </button>
      )}
      <div className={s.side} style={widths.leftOpen ? undefined : { display: 'none' }}>
        <div className={s.card}>
          <div className={s.heading}>
            <DatabaseRegular />
            <span className={s.grow}>データセット</span>
            <Button size="small" appearance="subtle" icon={<PanelLeftContractRegular />} onClick={() => setWidths((w) => ({ ...w, leftOpen: false }))} title="畳む" />
          </div>
          <DatasetPicker value={dataset} recent={settings.datasets ?? []} onOpen={(d) => void openDataset(d)} busy={loadingTables} />
          {dataset && tables && <span className={s.mono}>{dataset}</span>}
          {tablesError && (
            <MessageBar intent="error" layout="multiline">
              <MessageBarBody>{tablesError}</MessageBarBody>
            </MessageBar>
          )}
          {loadingTables && <Spinner size="tiny" label="表の一覧を読んでいます" />}
          {tables && (
            <>
              <Input size="small" contentBefore={<SearchRegular />} placeholder={`表を絞り込む(${tables.length} 件)`} value={filter} onChange={(_, d) => setFilter(d.value)} />
              <div className={s.list}>
                {shown.map((t) => (
                  <button key={t.ref} type="button" className={mergeClasses(s.item, selected === t.ref && s.itemOn)} onClick={() => void openTable(t.ref)} title={t.ref}>
                    {t.type === 'VIEW' ? <EyeRegular /> : <TableRegular />}
                    <span className={s.itemName}>{t.id}</span>
                    {t.type !== 'TABLE' && <Badge size="small" appearance="tint" color="informative">{t.type === 'VIEW' ? 'ビュー' : t.type}</Badge>}
                  </button>
                ))}
                {shown.length === 0 && <span className={s.muted}>当てはまる表がありません</span>}
              </div>
            </>
          )}
        </div>
      </div>

      <div className={s.splitter} role="separator" aria-orientation="vertical" title="ドラッグで幅を変える(ダブルクリックで元に戻す)" onPointerDown={(e) => widths.leftOpen && drag(e, 'left')} onDoubleClick={() => setWidths(WIDTHS)} />
      <div className={s.main}>
        {selected && <TableDetail refName={selected} info={info} error={infoError} loading={busy === 'info'} onOpenTable={(r) => void openTable(r)} onUseSql={changeSql} onAsk={(text) => setAsk({ id: Date.now(), text })} />}

        <div className={s.card}>
          <div className={s.row}>
            <span className={mergeClasses(s.heading, s.grow)}>SQL を試す</span>
            <Button size="small" appearance="subtle" icon={<HistoryRegular />} onClick={() => setHistoryOpen(true)} title="前に流した SQL(画面・AI・列を調べる)">
              履歴
            </Button>
            <CopyButton label="SQL をコピー" text={() => sql} />
            <Button size="small" appearance="subtle" icon={<ArrowDownloadRegular />} disabled={!sql.trim()} onClick={() => download('query.sql', sql)}>
              .sql で保存
            </Button>
          </div>
          <WorkPanel output={output} onOutput={setOutput} sql={sql} onLoadSql={changeSql} onAsk={(text) => setAsk({ id: Date.now(), text })} />
          <span className={s.muted}>流せるのは SELECT だけです(表を作る SQL は、BigQuery のコンソールで実行します)。Ctrl + Enter で流します。</span>
          <div className={s.editor}>
            <SqlEditor value={sql} onChange={changeSql} onRun={() => void runSql()} />
          </div>
          <div className={s.row}>
            <Button size="small" icon={<CheckmarkCircleRegular />} onClick={() => void dryRun()} disabled={!sql.trim() || !!busy} title="BigQuery の dry-run。料金はかかりません">
              料金なしで確かめる
            </Button>
            <Button size="small" appearance="primary" icon={<PlayRegular />} onClick={() => void runSql()} disabled={!sql.trim() || !!busy}>
              流す
            </Button>
            <Dropdown size="small" style={{ minWidth: '120px' }} value={`先頭 ${maxRows} 行`} selectedOptions={[String(maxRows)]} onOptionSelect={(_, d) => setMaxRows(Number(d.optionValue))}>
              {ROW_CHOICES.map((n) => (
                <Option key={n} value={String(n)}>{`先頭 ${n} 行`}</Option>
              ))}
            </Dropdown>
            {(busy === 'dry' || busy === 'run') && <Spinner size="tiny" label={busy === 'dry' ? '確かめています' : '流しています'} />}
          </div>
          {sqlError && (
            <MessageBar intent="error" layout="multiline">
              <MessageBarBody>
                <span className={s.mono}>{sqlError}</span>
              </MessageBarBody>
              <CopyButton label="エラーをコピー" text={() => sqlError} />
            </MessageBar>
          )}
          {dry && (
            <MessageBar intent={dry.runnable ? (dry.bytes != null && dry.bytes > dry.max_bytes ? 'warning' : 'success') : 'warning'} layout="multiline">
              <MessageBarBody>
                文の種類: {dry.statement_type ?? '不明'} / 読む量: {bytesLabel(dry.bytes)}(上限 {bytesLabel(dry.max_bytes)})/ 重さ: {dry.weight} / 流したときの概算:{' '}
                {dry.cost_usd == null ? '—' : `$${dry.cost_usd < 0.01 ? dry.cost_usd.toFixed(4) : dry.cost_usd.toFixed(2)}`}(${dry.price_per_tib}/TiB)
                {dry.views.length > 0 && <div className={s.mono}>参照するビュー: {dry.views.join(', ')}</div>}
                {dry.tables.length > 0 && <div className={s.mono}>読む元の表: {dry.tables.join(', ')}</div>}
                {dry.reason && <div>{dry.reason}</div>}
                {dry.runnable && dry.bytes != null && dry.bytes > dry.max_bytes && <div>上限を超えるので、流すと BigQuery が止めます。期間やパーティションで絞ってください</div>}
                {dry.columns.length > 0 && <div className={s.mono}>結果の列: {dry.columns.map((c) => `${c.name} ${c.type}`).join(', ')}</div>}
              </MessageBarBody>
            </MessageBar>
          )}
          {result && (
            <ResultGrid
              columns={result.columns}
              rows={result.rows}
              note={`${result.total_rows?.toLocaleString() ?? '?'} 行のうち先頭 ${result.rows.length} 行 / 読んだ量 ${bytesLabel(result.bytes)}${result.cached ? '(キャッシュ)' : ''} / ${result.seconds} 秒`}
            />
          )}
          {result?.job && <JobInfo job={result.job} />}
        </div>
      </div>

      <div className={s.splitter} role="separator" aria-orientation="vertical" title="ドラッグで幅を変える(ダブルクリックで元に戻す)" onPointerDown={(e) => widths.rightOpen && drag(e, 'right')} onDoubleClick={() => setWidths(WIDTHS)} />
      {!widths.rightOpen && (
        <button type="button" className={s.folded} onClick={() => setWidths((w) => ({ ...w, rightOpen: true }))} title="AI との会話を開く">
          <PanelRightExpandRegular />
          <SparkleRegular />
          <span className={s.foldedLabel}>AI と SQL を作る</span>
        </button>
      )}
      <HistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onUseSql={(text, run) => {
          changeSql(text)
          if (run) void runSql(text)
        }}
      />
      {/* 畳んでも消さない(考えている途中の会話が止まらないように) */}
      <div style={widths.rightOpen ? { minWidth: 0 } : { display: 'none' }}>
        <ChatPanel
          output={output}
          onOutput={setOutput}
          ask={ask}
          onFold={() => setWidths((w) => ({ ...w, rightOpen: false }))}
        dataset={dataset}
        selected={selected}
        sql={sql}
        last={last}
        hasError={!!sqlError}
        notes={settings.notes ?? ''}
        onNotes={(notes) => onSettings({ ...settings, notes })}
        onUseSql={(text, run) => {
          changeSql(text)
          if (run) void runSql(text)
        }}
      />
      </div>
    </div>
  )
}
