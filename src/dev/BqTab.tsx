import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Dropdown, Input, MessageBar, MessageBarBody, Option, Spinner, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { DatabaseRegular, PlayRegular, SearchRegular, TableRegular, EyeRegular, ArrowDownloadRegular, CheckmarkCircleRegular } from '@fluentui/react-icons'
import { DevApi, bytesLabel, isFailure, type DryRun, type RunResult, type Settings, type TableInfo, type Column, type Row } from './api'
import { CopyButton } from './CopyButton'
import { ResultGrid } from './ResultGrid'
import { SqlEditor } from './SqlEditor'
import { columnsMarkdown, toMarkdown } from './format'
import { DatasetPicker } from './DatasetPicker'
import { ChatPanel } from './ChatPanel'

const useStyles = makeStyles({
  // 左: データセットと表 / 中: 表の中身と SQL / 右: Gemini との会話(SQL を見ながら話せるように、並べて置く)
  root: { display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr) minmax(360px, 34%)', gap: '12px', alignItems: 'start' },
  side: { display: 'flex', flexDirection: 'column', gap: '8px', position: 'sticky', top: '12px' },
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
  facts: { display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: '12px', rowGap: '2px', fontSize: tokens.fontSizeBase200 },
  factKey: { color: tokens.colorNeutralForeground3, fontWeight: tokens.fontWeightSemibold },
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
  const [preview, setPreview] = useState<{ columns: Column[]; rows: Row[] } | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [busy, setBusy] = useState<'' | 'info' | 'preview' | 'dry' | 'run'>('')

  const [sql, setSql] = useState(readDraft)
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
    setPreview(null)
    setPreviewError('')
    setBusy('info')
    const r = await DevApi.table(ref)
    setBusy('')
    if (isFailure(r)) setInfoError(r.error)
    else setInfo(r)
  }

  const loadPreview = async () => {
    if (!selected) return
    setBusy('preview')
    setPreviewError('')
    const r = await DevApi.preview(selected)
    setBusy('')
    if (isFailure(r)) setPreviewError(r.error)
    else setPreview(r)
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

  const runSql = async () => {
    if (!sql.trim() || busy) return
    setBusy('run')
    setSqlError('')
    const r = await DevApi.run(sql, maxRows)
    setBusy('')
    if (isFailure(r)) {
      setResult(null)
      setSqlError(r.error)
    } else {
      setResult(r)
      setDry(null)
    }
  }

  // Gemini に渡す「いまの SQL を流した結果」(エラー、または結果の先頭 20 行)
  const last = useMemo(() => {
    if (sqlError) return `エラー:
${sqlError}`
    if (result) return `${result.total_rows ?? '?'} 行(先頭 ${Math.min(20, result.rows.length)} 行):

${toMarkdown(result.columns, result.rows.slice(0, 20))}`
    return ''
  }, [sqlError, result])

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return (tables ?? []).filter((t) => !f || t.id.toLowerCase().includes(f))
  }, [tables, filter])

  return (
    <div className={s.root}>
      <div className={s.side}>
        <div className={s.card}>
          <div className={s.heading}>
            <DatabaseRegular /> データセット
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

      <div className={s.main}>
        {selected && (
          <div className={s.card}>
            <div className={s.row}>
              <span className={mergeClasses(s.heading, s.grow)}>
                <TableRegular />
                <span className={s.mono}>{selected}</span>
              </span>
              <CopyButton label="場所をコピー" text={() => `\`${selected}\``} />
              {info && <CopyButton label="列の一覧をコピー" title="Gemini・Claude に渡す形(Markdown の表)" text={() => columnsMarkdown(info.ref, info.columns, info.description)} />}
              <Button size="small" appearance="subtle" icon={<PlayRegular />} onClick={() => changeSql(`SELECT *\nFROM \`${selected}\`\nLIMIT 20`)}>
                SQL の欄に入れる
              </Button>
            </div>
            {busy === 'info' && <Spinner size="tiny" label="表を読んでいます" />}
            {infoError && (
              <MessageBar intent="error" layout="multiline">
                <MessageBarBody>{infoError}</MessageBarBody>
              </MessageBar>
            )}
            {info && (
              <>
                <div className={s.facts}>
                  <span className={s.factKey}>種類</span>
                  <span>{info.type}</span>
                  <span className={s.factKey}>行数</span>
                  <span>{info.rows?.toLocaleString() ?? '—'}</span>
                  <span className={s.factKey}>大きさ</span>
                  <span>{bytesLabel(info.bytes)}</span>
                  <span className={s.factKey}>最終更新</span>
                  <span>{info.modified ? new Date(info.modified).toLocaleString('ja-JP') : '—'}</span>
                  <span className={s.factKey}>場所</span>
                  <span>{info.location ?? '—'}</span>
                  <span className={s.factKey}>パーティション</span>
                  <span>{info.partitioning ? `${info.partitioning.field}(${info.partitioning.type})` : 'なし'}</span>
                  {info.clustering.length > 0 && (
                    <>
                      <span className={s.factKey}>クラスタ</span>
                      <span>{info.clustering.join(', ')}</span>
                    </>
                  )}
                  {info.description && (
                    <>
                      <span className={s.factKey}>説明</span>
                      <span>{info.description}</span>
                    </>
                  )}
                </div>
                <ResultGrid
                  note={`列 ${info.columns.length}`}
                  columns={[
                    { name: '列', type: '' },
                    { name: '型', type: '' },
                    { name: 'モード', type: '' },
                    { name: '説明', type: '' },
                  ]}
                  rows={info.columns.map((c) => ({ 列: c.name, 型: c.type, モード: c.mode, 説明: c.description }))}
                />
                {info.sources.length > 0 && (
                  <div className={s.row}>
                    <span className={s.label}>参照している元の表</span>
                    {info.sources.map((r) => (
                      <Button key={r} size="small" appearance="secondary" title={r} onClick={() => void openTable(r)}>
                        {r.split('.').slice(-2).join('.')}
                      </Button>
                    ))}
                  </div>
                )}
                {info.view_sql && (
                  <div className={s.row}>
                    <span className={mergeClasses(s.label, s.grow)}>ビューの SQL</span>
                    <CopyButton text={() => info.view_sql} />
                    <Button size="small" appearance="subtle" onClick={() => changeSql(info.view_sql)}>
                      SQL の欄に入れる
                    </Button>
                  </div>
                )}
                <div className={s.row}>
                  <span className={mergeClasses(s.label, s.grow)}>先頭の行</span>
                  <Button size="small" onClick={() => void loadPreview()} disabled={busy === 'preview' || info.type !== 'TABLE'} title={info.type !== 'TABLE' ? 'ビューは、SQL の欄で SELECT を流して見てください' : '料金はかかりません'}>
                    {busy === 'preview' ? '読んでいます…' : '先頭の 20 行を見る'}
                  </Button>
                </div>
                {previewError && (
                  <MessageBar intent="error" layout="multiline">
                    <MessageBarBody>{previewError}</MessageBarBody>
                  </MessageBar>
                )}
                {preview && <ResultGrid columns={preview.columns} rows={preview.rows} />}
              </>
            )}
          </div>
        )}

        <div className={s.card}>
          <div className={s.row}>
            <span className={mergeClasses(s.heading, s.grow)}>SQL を試す</span>
            <CopyButton label="SQL をコピー" text={() => sql} />
            <Button size="small" appearance="subtle" icon={<ArrowDownloadRegular />} disabled={!sql.trim()} onClick={() => download('query.sql', sql)}>
              .sql で保存
            </Button>
          </div>
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
                文の種類: {dry.statement_type ?? '不明'} / 読む量: {bytesLabel(dry.bytes)}(上限 {bytesLabel(dry.max_bytes)})
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
        </div>
      </div>

      <ChatPanel
        dataset={dataset}
        selected={selected}
        sql={sql}
        last={last}
        hasError={!!sqlError}
        notes={settings.notes ?? ''}
        onNotes={(notes) => onSettings({ ...settings, notes })}
        onUseSql={changeSql}
      />
    </div>
  )
}
