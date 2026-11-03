// データの取り込みの管理(settings.dataimport。⚙ →「データの取り込み」。管理する人だけ。2026-11-03 利用者)。
// 1 行 1 出力の表にする(2026-11-03 利用者「見づらい」: 枠ごとに値が折り返して並び、上下で見比べられず、ボタンが多くて状態と数字が埋もれていた)。
// 列は「出力 | 状態 | データの新しさ | 行数(増減) | 間隔 | 次の確認 | ⋯」だけ。止めた理由は、その行のすぐ下に 1 行で出す。
// 今すぐ取り込む・確認だけは行の ⋯ に、ほかの時刻・確認だけの結果・表の場所(と接続を確認)・記録は、行を押して開く詳しい所に入れる。
// まだ場所のない出力も行に出し(未設定)、詳しい所で場所を入れられるようにする(表の場所を探しに行かなくて済むように)。
// 上の段は、定期の取り込みの入・切と、全部の操作だけ。サーバーは server/ccp/bq_import.py と appsettings.py
import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Button,
  InfoLabel,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarBody,
  Select,
  Spinner,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import { ArrowSyncRegular, ChevronDownRegular, ChevronRightRegular, MoreHorizontalRegular, SearchRegular } from '@fluentui/react-icons'
import { DataImportService, type ImportCheck, type ImportOutput, type ImportRecord, type ImportStatus } from './data/dataImport'
import { setImportStatus } from './dataImportState'
import { bqOutputLabel } from './gcp/bq'
import { LabeledValue } from './LabeledValue'
import { BqProject, OutputLocation } from './BqLocations'
import { useBqLocations, type BqLocationsState } from './useBqLocations'
import { typo } from './typo'
import { locale, tr, useT } from './i18n'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM, minWidth: 0 },
  bar: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalS },
  barRight: { marginLeft: 'auto', display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  row: { cursor: 'pointer' },
  name: { ...typo.valueStrong, display: 'inline-flex', alignItems: 'center', columnGap: '4px', whiteSpace: 'nowrap' },
  num: { whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  dim: { color: tokens.colorNeutralForeground3 },
  reason: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1, overflowWrap: 'anywhere', paddingBottom: tokens.spacingVerticalS },
  detail: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM, padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS} ${tokens.spacingVerticalM}`, backgroundColor: tokens.colorNeutralBackground2, borderRadius: tokens.borderRadiusMedium },
  pairs: { display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalXL, rowGap: tokens.spacingVerticalXS },
  sub: { ...typo.heading },
  section: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  up: { color: tokens.colorPaletteGreenForeground1 },
  down: { color: tokens.colorPaletteRedForeground1 },
  message: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1, overflowWrap: 'anywhere' },
  select: { minWidth: '108px' },
  checks: { display: 'flex', flexDirection: 'column', rowGap: '2px' },
  issue: { fontSize: tokens.fontSizeBase200, overflowWrap: 'anywhere' },
  history: { display: 'grid', gridTemplateColumns: 'auto auto auto 1fr', columnGap: tokens.spacingHorizontalM, rowGap: '2px', fontSize: tokens.fontSizeBase200, alignItems: 'baseline' },
  historyHead: { ...typo.pairLabel },
})

/** 日時を短く(月/日 時:分) */
const when = (iso?: string | null): string =>
  iso ? new Date(iso).toLocaleString(locale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

/** 「3 時間前」「4 分後」(時刻を並べるより、古さ・近さが一目で分かるように) */
function relative(iso?: string | null): string {
  if (!iso) return ''
  const min = Math.round((new Date(iso).getTime() - Date.now()) / 60_000)
  const f = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' })
  const abs = Math.abs(min)
  if (abs < 1) return tr('いま', 'now')
  if (abs < 60) return f.format(min, 'minute')
  if (abs < 48 * 60) return f.format(Math.round(min / 60), 'hour')
  return f.format(Math.round(min / 1440), 'day')
}

/** 間隔の選択肢の言葉 */
const intervalName = (min: number): string =>
  min >= 1440 ? tr(`${min / 1440} 日ごと`, `Every ${min / 1440} day${min === 1440 ? '' : 's'}`) : min >= 60 ? tr(`${min / 60} 時間ごと`, `Every ${min / 60} h`) : tr(`${min} 分ごと`, `Every ${min} min`)

/** 何で取り込んだか */
const triggerName = (v?: string | null): string =>
  ({ auto: tr('定期', 'Scheduled'), startup: tr('起動時', 'On start'), manual: tr('手で', 'Manual'), open: tr('開いたとき', 'On open'), settings: tr('設定', 'Settings') })[v ?? ''] ?? (v || '')

const outputLabel = (name: string, fallback: string) => {
  const l = bqOutputLabel(name)
  return l === name ? fallback : l
}

// 表の行。まだ場所のない出力も、未設定の行として並べる
type Row = ImportOutput & { unset?: boolean }

function StatusBadge({ o }: { o: Row }) {
  const t = useT()
  if (o.unset) return <Badge appearance="outline" color="subtle">{t('未設定', 'Not set')}</Badge>
  if (o.status === 'error') return <Badge appearance="filled" color="danger">{t('止めた', 'Stopped')}</Badge>
  if (o.status === 'never') return <Badge appearance="outline" color="informative">{t('まだ', 'Not yet')}</Badge>
  if (o.stale) return <Badge appearance="filled" color="warning">{t('古い', 'Stale')}</Badge>
  return <Badge appearance="tint" color="success">{t('取り込めている', 'OK')}</Badge>
}

function RowsDiff({ rows, before }: { rows?: number | null; before?: number | null }) {
  const s = useStyles()
  if (rows == null) return null
  const d = before == null ? 0 : rows - before
  return (
    <>
      {rows.toLocaleString(locale())}
      {d !== 0 && <span className={d > 0 ? s.up : s.down}> ({d > 0 ? '+' : ''}{d.toLocaleString(locale())})</span>}
    </>
  )
}

function History({ source }: { source: string }) {
  const s = useStyles()
  const t = useT()
  const [rows, setRows] = useState<ImportRecord[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    void DataImportService.history(source, 30).then((r) => {
      if (!alive) return
      if (r.data) setRows(r.data)
      else setError(r.error ?? '')
    })
    return () => {
      alive = false
    }
  }, [source])
  if (error) return <div className={s.message}>{error}</div>
  if (!rows) return <Spinner size="extra-tiny" />
  if (!rows.length) return <div className={s.note}>{t('記録はまだありません', 'No records yet')}</div>
  return (
    <div className={s.history}>
      <span className={s.historyHead}>{t('時刻', 'Time')}</span>
      <span className={s.historyHead}>{t('結果', 'Result')}</span>
      <span className={s.historyHead}>{t('何で・だれが', 'How / who')}</span>
      <span className={s.historyHead}>{t('中身', 'Details')}</span>
      {rows.map((r, i) => (
        <HistoryRow key={i} r={r} />
      ))}
    </div>
  )
}

function HistoryRow({ r }: { r: ImportRecord }) {
  const s = useStyles()
  const t = useT()
  const ok = r.status === 'ok'
  const badge =
    r.status === 'settings' ? (
      <Badge size="small" appearance="outline" color="informative">{t('場所を変えた', 'Location changed')}</Badge>
    ) : ok ? (
      <Badge size="small" appearance="tint" color="success">{t('取り込んだ', 'Imported')}</Badge>
    ) : (
      <Badge size="small" appearance="filled" color="danger">{t('止めた', 'Stopped')}</Badge>
    )
  return (
    <>
      <span>{when(r.importedAt)}</span>
      <span>{badge}</span>
      <span>
        {triggerName(r.trigger)}
        {r.actor ? ` · ${r.actor}` : ''}
      </span>
      <span className={ok || r.status === 'settings' ? undefined : s.message}>
        {r.message}
        {/* 同じ理由の失敗は、記録を足さずに回数を進めている(サーバー)。最後に試した時刻も添える */}
        {r.repeat > 1 && ` ${t(`(同じ理由で ${r.repeat} 回。最後 ${when(r.checkedAt)})`, `(${r.repeat} times for the same reason; last ${when(r.checkedAt)})`)}`}
      </span>
    </>
  )
}

function CheckResult({ c }: { c: ImportCheck['outputs'][number] }) {
  const s = useStyles()
  const t = useT()
  return (
    <div className={s.checks}>
      <div className={s.issue}>
        {c.ok ? <Badge size="small" appearance="tint" color="success">{t('取り込める', 'Importable')}</Badge> : <Badge size="small" appearance="filled" color="danger">{t('取り込めない', 'Not importable')}</Badge>}{' '}
        {c.rows != null && t(`${c.rows.toLocaleString(locale())} 行`, `${c.rows.toLocaleString(locale())} rows`)}
        {c.dataAsOf && ` · ${t('データの時点', 'Data as of')} ${when(c.dataAsOf)}`}
      </div>
      {c.issues.length === 0 && <div className={s.note}>{t('気になる所はありません', 'No issues found')}</div>}
      {c.issues.map((i, k) => (
        <div key={k} className={s.issue}>
          <Badge size="small" appearance="outline" color={i.level === 'NG' ? 'danger' : 'warning'}>{i.level === 'NG' ? 'NG' : t('注意', 'Warning')}</Badge> {i.text}
        </div>
      ))}
      <div className={s.note}>{t('確認だけの結果です。何も書き込んでいません。', 'Check-only result. Nothing was written.')}</div>
    </div>
  )
}

/** 行を押して開く詳しい所: ほかの時刻・確認だけの結果・表の場所・記録 */
function Detail({ o, check, loc }: { o: Row; check?: ImportCheck['outputs'][number]; loc: BqLocationsState }) {
  const s = useStyles()
  const t = useT()
  return (
    <div className={s.detail}>
      {!o.unset && (
        <div className={s.pairs}>
          <LabeledValue label={t('データの時点', 'Data as of')} empty="none">{when(o.dataAsOf)}</LabeledValue>
          <LabeledValue label={t('取り込んだ', 'Imported')} empty="none">{when(o.importedAt)}</LabeledValue>
          <LabeledValue label={t('BigQuery の更新', 'Updated in BigQuery')} empty="none">{when(o.sourceModified)}</LabeledValue>
          <LabeledValue label={t('最後に確かめた', 'Last checked')} empty="none">{when(o.checkedAt)}</LabeledValue>
          <LabeledValue label={t('何で', 'How')} empty="none">{[triggerName(o.trigger), o.actor].filter(Boolean).join(' · ')}</LabeledValue>
        </div>
      )}
      {check && (
        <div className={s.section}>
          <span className={s.sub}>{t('確認だけの結果', 'Check-only result')}</span>
          <CheckResult c={check} />
        </div>
      )}
      <div className={s.section}>
        <span className={s.sub}>{t('表の場所', 'Table location')}</span>
        <OutputLocation name={o.name} loc={loc} />
      </div>
      {!o.unset && (
        <div className={s.section}>
          <span className={s.sub}>{t('記録', 'History')}</span>
          <History source={o.name} />
        </div>
      )}
    </div>
  )
}

export function DataImportPanel({ onImported }: { /** 取り込めたら、商品(在庫・売上の集計)を読み直す */ onImported: () => void }) {
  const s = useStyles()
  const t = useT()
  const [status, setStatus] = useState<ImportStatus | null>(null)
  const [error, setError] = useState('')
  // いま動いている操作(全部 / 出力の名前 / 設定)。動いている間は、ほかの操作を押せなくする
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ intent: 'success' | 'warning' | 'error'; text: string } | null>(null)
  const [checks, setChecks] = useState<Record<string, ImportCheck['outputs'][number]>>({})
  const [open, setOpen] = useState<string | null>(null)

  const take = useCallback((s: ImportStatus) => {
    setStatus(s)
    setImportStatus(s)
  }, [])
  const read = useCallback(async () => {
    const r = await DataImportService.status()
    if (r.data) take(r.data)
    else setError(r.error ?? '')
  }, [take])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 開いたときに、いまの状態を読む
    void read()
  }, [read])
  const loc = useBqLocations(() => void read())

  const sync = async (names?: string[]) => {
    setBusy(names?.[0] ?? '*')
    setNotice(null)
    const r = await DataImportService.sync({ force: true, names })
    setBusy(null)
    if (!r.data) return setNotice({ intent: 'error', text: r.error ?? '' })
    take(r.data)
    const label = (n: string) => bqOutputLabel(n)
    if (r.data.imported.length) onImported()
    // 止めた理由は、その行の下に出る。ここでは、どの出力かだけを言う
    if (r.data.failed.length)
      setNotice({ intent: 'warning', text: t('取り込めなかった出力があります(前のデータのまま使います): ', 'Some outputs were not imported (the previous data is kept): ') + r.data.failed.map((f) => label(f.name)).join(t('・', ', ')) })
    else if (r.data.skipped === 'busy') setNotice({ intent: 'warning', text: t('ほかの取り込みの最中です。少し待ってから押してください', 'Another import is running. Try again shortly') })
    else if (r.data.imported.length) setNotice({ intent: 'success', text: t('取り込みました: ', 'Imported: ') + r.data.imported.map((x) => label(x.name)).join(t('・', ', ')) })
    else setNotice({ intent: 'success', text: t('読み直しました(取り込むデータはありませんでした)', 'Checked (nothing to import)') })
  }

  const check = async (names?: string[]) => {
    setBusy(names?.[0] ?? '*')
    setNotice(null)
    const r = await DataImportService.check(names)
    setBusy(null)
    if (!r.data) return setNotice({ intent: 'error', text: r.error ?? '' })
    const got = Object.fromEntries(r.data.outputs.map((c) => [c.name, c]))
    // 1 つだけ確かめたときは、ほかの出力の前の結果を残す
    setChecks((prev) => (names?.length ? { ...prev, ...got } : got))
    // 結果は行の詳しい所に出す。1 つなら、その行を開く。全部なら、NG のある出力の数を知らせる
    if (names?.length === 1) setOpen(names[0])
    else {
      const bad = r.data.outputs.filter((c) => !c.ok).length
      setNotice({
        intent: bad ? 'warning' : 'success',
        text: bad
          ? t(`確認だけ: ${bad} 個の出力に NG があります(行を押すと中身)。何も書き込んでいません。`, `Check only: ${bad} output(s) have NG (open the row for details). Nothing was written.`)
          : t('確認だけ: NG はありません(行を押すと中身)。何も書き込んでいません。', 'Check only: no NG (open a row for details). Nothing was written.'),
      })
    }
  }

  const saveSettings = async (patch: { enabled?: boolean; interval?: [string, number] }) => {
    if (!status) return
    const intervals = { ...status.auto.intervals, ...(patch.interval ? { [patch.interval[0]]: patch.interval[1] } : {}) }
    const enabled = patch.enabled ?? status.auto.enabled
    setBusy('settings')
    const r = await DataImportService.saveSettings({ enabled, intervals })
    setBusy(null)
    if (!r.data) return setNotice({ intent: 'error', text: r.error ?? '' })
    // 次の確認の時刻も変わるので、状態を読み直す
    await read()
  }

  if (error) return <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>
  if (!status) return <Spinner size="small" />
  const rows: Row[] = [
    ...status.outputs,
    ...status.unconfigured.map((u) => ({ name: u.name, label: u.label, env: u.env, status: 'never', message: '', intervalMin: status.auto.intervals[u.name] ?? 60, stale: false, unset: true })),
  ]
  const envOff = status.auto.envDisabled
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  return (
    <div className={s.root}>
      <div className={s.bar}>
        <InfoLabel
          info={t(
            '入にすると、サーバーが出力ごとの間隔で BigQuery を確かめ、変わっていれば取り込みます(画面を開いていなくても)。切のあいだは、画面を開いたときに確かめます。間隔は、表の「間隔」で出力ごとに選びます。',
            'When on, the server checks BigQuery at each output’s interval and imports changes, even with no one using the app. When off, it checks when someone opens the app. Choose the interval per output in the table.',
          )}
        >
          {t('定期の取り込み', 'Scheduled import')}
        </InfoLabel>
        <Switch
          checked={status.auto.enabled}
          disabled={!!busy || envOff || !status.configured}
          aria-label={t('定期の取り込み', 'Scheduled import')}
          label={status.auto.enabled ? t('入', 'On') : t('切', 'Off')}
          onChange={(_, d) => void saveSettings({ enabled: d.checked })}
        />
        <div className={s.barRight}>
          {busy === '*' && <Spinner size="extra-tiny" />}
          <Button size="small" icon={<SearchRegular />} disabled={!!busy || !status.configured} onClick={() => void check()}>
            {t('全部を確認だけ', 'Check all only')}
          </Button>
          <Button size="small" appearance="primary" icon={<ArrowSyncRegular />} disabled={!!busy || !status.configured} onClick={() => void sync()}>
            {t('全部を今すぐ取り込む', 'Import all now')}
          </Button>
        </div>
      </div>
      {/* 環境変数で止めているときは、画面の入・切が効かないことを、スイッチのすぐ下で言う(「入」に見えて動いていない、をなくす) */}
      {envOff && (
        <MessageBar intent="warning" layout="multiline">
          <MessageBarBody>
            {t(
              '環境変数(BQ_AUTO_SYNC=0)で止めています。画面の入・切は効きません。この画面で決めるには、サーバーの設定からその行を消して、起動し直してください。',
              'Stopped by an environment variable (BQ_AUTO_SYNC=0). The switch here has no effect. To control it here, remove that line from the server settings and restart.',
            )}
          </MessageBarBody>
        </MessageBar>
      )}
      {notice && (
        <MessageBar intent={notice.intent} layout="multiline">
          <MessageBarBody>{notice.text}</MessageBarBody>
        </MessageBar>
      )}
      <Table size="small" aria-label={t('出力ごとの取り込み', 'Import per output')}>
        <TableHeader>
          <TableRow>
            <TableHeaderCell>{t('出力', 'Output')}</TableHeaderCell>
            <TableHeaderCell>{t('状態', 'Status')}</TableHeaderCell>
            <TableHeaderCell>{t('データの新しさ', 'Data age')}</TableHeaderCell>
            <TableHeaderCell>{t('行数', 'Rows')}</TableHeaderCell>
            <TableHeaderCell>{t('間隔', 'Interval')}</TableHeaderCell>
            <TableHeaderCell>{t('次の確認', 'Next check')}</TableHeaderCell>
            <TableHeaderCell aria-label={t('操作', 'Actions')} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((o) => {
            const isOpen = open === o.name
            return (
              <Fragment key={o.name}>
                <TableRow className={s.row} onClick={() => setOpen(isOpen ? null : o.name)} aria-expanded={isOpen}>
                  <TableCell>
                    <span className={s.name}>
                      {isOpen ? <ChevronDownRegular /> : <ChevronRightRegular />}
                      {outputLabel(o.name, o.label)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge o={o} />
                  </TableCell>
                  <TableCell className={s.num}>{!o.unset && o.dataAsOf ? relative(o.dataAsOf) : <span className={s.dim}>—</span>}</TableCell>
                  <TableCell className={s.num}>{o.rows != null ? <RowsDiff rows={o.rows} before={o.rowsBefore} /> : <span className={s.dim}>—</span>}</TableCell>
                  <TableCell onClick={stop}>
                    <Select size="small" className={s.select} value={String(o.intervalMin)} disabled={!!busy} aria-label={t('確かめる間隔', 'Check interval')} onChange={(_, d) => void saveSettings({ interval: [o.name, Number(d.value)] })}>
                      {status.auto.choices.map((m) => (
                        <option key={m} value={m}>
                          {intervalName(m)}
                        </option>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell className={s.num}>
                    {busy === o.name ? (
                      <Spinner size="extra-tiny" />
                    ) : o.unset ? (
                      <span className={s.dim}>—</span>
                    ) : envOff || !status.auto.active ? (
                      <span className={s.dim}>{t('切', 'Off')}</span>
                    ) : (
                      relative(o.nextCheckAt) || <span className={s.dim}>—</span>
                    )}
                  </TableCell>
                  <TableCell onClick={stop}>
                    <Menu>
                      <MenuTrigger disableButtonEnhancement>
                        <Button size="small" appearance="subtle" icon={<MoreHorizontalRegular />} disabled={!!busy} aria-label={t('操作', 'Actions')} />
                      </MenuTrigger>
                      <MenuPopover>
                        <MenuList>
                          <MenuItem icon={<ArrowSyncRegular />} disabled={o.unset} onClick={() => void sync([o.name])}>
                            {t('今すぐ取り込む', 'Import now')}
                          </MenuItem>
                          <MenuItem icon={<SearchRegular />} disabled={o.unset} onClick={() => void check([o.name])}>
                            {t('確認だけ(書き込まない)', 'Check only (no writes)')}
                          </MenuItem>
                          <MenuItem onClick={() => setOpen(o.name)}>{t('詳しく・表の場所・記録', 'Details, location, history')}</MenuItem>
                        </MenuList>
                      </MenuPopover>
                    </Menu>
                  </TableCell>
                </TableRow>
                {/* 止めた理由は、その行のすぐ下に 1 行で(上の帯に集めると、どの行のことか探すことになるため) */}
                {o.status === 'error' && !o.unset && (
                  <TableRow>
                    <TableCell colSpan={7} className={s.reason}>
                      {o.message}
                      {(o.repeat ?? 1) > 1 && ` ${t(`(同じ理由で ${o.repeat} 回。前のデータのまま使っています)`, `(${o.repeat} times for the same reason; still using the previous data)`)}`}
                    </TableCell>
                  </TableRow>
                )}
                {isOpen && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Detail o={o} check={checks[o.name]} loc={loc} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
      {!status.configured && (
        <div className={s.note}>{t('BigQuery の表の場所が、まだ 1 つも設定されていません。行を押して「表の場所」に入れてください。', 'No BigQuery locations are set yet. Open a row and enter its table location.')}</div>
      )}
      {/* ジョブのプロジェクトと、表の場所を変えた記録(ふだんは変えないので畳む) */}
      <Accordion collapsible>
        <AccordionItem value="project">
          <AccordionHeader size="small">{t('BigQuery の共通の設定(ジョブのプロジェクト・場所を変えた記録)', 'BigQuery common settings (job project, location history)')}</AccordionHeader>
          <AccordionPanel>
            <BqProject loc={loc} />
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
