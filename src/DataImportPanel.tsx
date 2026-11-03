// データの取り込みの管理(settings.dataimport。⚙ →「データの取り込み」。管理する人だけ。2026-11-03 利用者)。
// BigQuery の出力ごとに、いまの状態(取り込めている・止めた・古い・まだ)・データの時点・取り込んだ時刻・行数の増減・次の確認・間隔を出し、
// 出力ごと・全部の「今すぐ取り込む」と「確認だけ」(読んで確かめるだけ。何も書かない)、定期の取り込みの入・切と間隔を変えられる。
// 行の「記録」で、その出力の取り込みの記録(だれが・いつ・何で・結果)を開く。サーバーは server/ccp/bq_import.py
import { useCallback, useEffect, useState } from 'react'
import {
  Badge,
  Button,
  InfoLabel,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Select,
  Spinner,
  Switch,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import { ArrowSyncRegular, ChevronDownRegular, ChevronRightRegular, SearchRegular } from '@fluentui/react-icons'
import { DataImportService, type ImportCheck, type ImportOutput, type ImportRecord, type ImportStatus } from './data/dataImport'
import { setImportStatus } from './dataImportState'
import { bqOutputLabel } from './gcp/bq'
import { LabeledValue } from './LabeledValue'
import { typo } from './typo'
import { locale, tr, useT } from './i18n'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM, minWidth: 0 },
  bar: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalS },
  barRight: { marginLeft: 'auto', display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  list: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS },
  item: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  // 止めた・古い出力は、枠の左に色を付けて目に入るように
  itemError: { borderLeft: `3px solid ${tokens.colorPaletteRedBorder2}` },
  itemWarn: { borderLeft: `3px solid ${tokens.colorPaletteMarigoldBorder2}` },
  head: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS, flexWrap: 'wrap', rowGap: tokens.spacingVerticalXS },
  name: { ...typo.heading },
  headRight: { marginLeft: 'auto', display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalXS, flexWrap: 'wrap' },
  pairs: { display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalXL, rowGap: tokens.spacingVerticalXS },
  message: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1, overflowWrap: 'anywhere' },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  up: { color: tokens.colorPaletteGreenForeground1 },
  down: { color: tokens.colorPaletteRedForeground1 },
  select: { minWidth: '110px' },
  checks: { display: 'flex', flexDirection: 'column', rowGap: '2px', paddingLeft: tokens.spacingHorizontalS, borderLeft: `2px solid ${tokens.colorNeutralStroke2}` },
  issue: { fontSize: tokens.fontSizeBase200, overflowWrap: 'anywhere' },
  history: { display: 'grid', gridTemplateColumns: 'auto auto auto 1fr', columnGap: tokens.spacingHorizontalM, rowGap: '2px', fontSize: tokens.fontSizeBase200, alignItems: 'baseline' },
  historyHead: { ...typo.pairLabel },
  unconfigured: { display: 'flex', flexDirection: 'column', rowGap: '2px' },
})

/** 日時を短く(月/日 時:分) */
const when = (iso?: string | null): string =>
  iso ? new Date(iso).toLocaleString(locale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

/** 間隔の選択肢の言葉 */
const intervalName = (min: number): string =>
  min >= 1440 ? tr(`${min / 1440} 日ごと`, `Every ${min / 1440} day${min === 1440 ? '' : 's'}`) : min >= 60 ? tr(`${min / 60} 時間ごと`, `Every ${min / 60} h`) : tr(`${min} 分ごと`, `Every ${min} min`)

/** 何で取り込んだか */
const triggerName = (v?: string | null): string =>
  ({ auto: tr('定期', 'Scheduled'), startup: tr('起動時', 'On start'), manual: tr('手で', 'Manual'), open: tr('開いたとき', 'On open') })[v ?? ''] ?? (v || '')

const outputLabel = (name: string, fallback: string) => {
  const l = bqOutputLabel(name)
  return l === name ? fallback : l
}

function StatusBadge({ o }: { o: ImportOutput }) {
  const t = useT()
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
  return (
    <>
      <span>{when(r.importedAt)}</span>
      <span>
        {ok ? <Badge size="small" appearance="tint" color="success">{t('取り込んだ', 'Imported')}</Badge> : <Badge size="small" appearance="filled" color="danger">{t('止めた', 'Stopped')}</Badge>}
      </span>
      <span>
        {triggerName(r.trigger)}
        {r.actor ? ` · ${r.actor}` : ''}
      </span>
      <span className={ok ? undefined : s.message}>
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
    </div>
  )
}

function OutputItem(p: {
  o: ImportOutput
  auto: ImportStatus['auto']
  busy: boolean
  /** この出力の操作が動いている */
  working: boolean
  check?: ImportCheck['outputs'][number]
  onSync: () => void
  onCheck: () => void
  onInterval: (min: number) => void
}) {
  const s = useStyles()
  const t = useT()
  const { o } = p
  const [open, setOpen] = useState(false)
  return (
    <div className={mergeClasses(s.item, o.status === 'error' ? s.itemError : o.stale ? s.itemWarn : undefined)}>
      <div className={s.head}>
        <span className={s.name}>{outputLabel(o.name, o.label)}</span>
        <StatusBadge o={o} />
        <div className={s.headRight}>
          {p.working && <Spinner size="extra-tiny" />}
          <Select
            size="small"
            className={s.select}
            value={String(o.intervalMin)}
            disabled={p.busy}
            aria-label={t('確かめる間隔', 'Check interval')}
            onChange={(_, d) => p.onInterval(Number(d.value))}
          >
            {p.auto.choices.map((m) => (
              <option key={m} value={m}>
                {intervalName(m)}
              </option>
            ))}
          </Select>
          <Button size="small" appearance="subtle" icon={<SearchRegular />} disabled={p.busy} onClick={p.onCheck}>
            {t('確認だけ', 'Check only')}
          </Button>
          <Button size="small" icon={<ArrowSyncRegular />} disabled={p.busy} onClick={p.onSync}>
            {t('今すぐ取り込む', 'Import now')}
          </Button>
        </div>
      </div>
      {o.status === 'error' && (
        <div className={s.message}>
          {o.message}
          {(o.repeat ?? 1) > 1 && ` ${t(`(同じ理由で ${o.repeat} 回)`, `(${o.repeat} times for the same reason)`)}`}
        </div>
      )}
      <div className={s.pairs}>
        <LabeledValue label={t('データの時点', 'Data as of')} empty="none">{when(o.dataAsOf)}</LabeledValue>
        <LabeledValue label={t('取り込んだ', 'Imported')} empty="none">{when(o.importedAt)}</LabeledValue>
        <LabeledValue label={t('行数', 'Rows')} empty="none">{o.rows != null && <RowsDiff rows={o.rows} before={o.rowsBefore} />}</LabeledValue>
        <LabeledValue label={t('BigQuery の更新', 'Updated in BigQuery')} empty="none">{when(o.sourceModified)}</LabeledValue>
        <LabeledValue label={t('最後に確かめた', 'Last checked')} empty="none">{when(o.checkedAt)}</LabeledValue>
        <LabeledValue label={t('次の確認', 'Next check')} empty="none">{o.nextCheckAt ? when(o.nextCheckAt) : p.auto.active ? '' : t('定期の取り込みは切', 'Scheduled import is off')}</LabeledValue>
        <LabeledValue label={t('何で', 'How')} empty="none">{[triggerName(o.trigger), o.actor].filter(Boolean).join(' · ')}</LabeledValue>
      </div>
      {p.check && <CheckResult c={p.check} />}
      <div>
        <Button size="small" appearance="transparent" icon={open ? <ChevronDownRegular /> : <ChevronRightRegular />} onClick={() => setOpen(!open)}>
          {t('記録', 'History')}
        </Button>
      </div>
      {open && <History source={o.name} />}
    </div>
  )
}

export function DataImportPanel({ onImported }: { /** 取り込めたら、商品(在庫・売上の集計)を読み直す */ onImported: () => void }) {
  const s = useStyles()
  const t = useT()
  const [status, setStatus] = useState<ImportStatus | null>(null)
  const [error, setError] = useState('')
  // いま動いている操作(全部 / 出力の名前)。動いている間は、ほかの操作を押せなくする
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ intent: 'success' | 'warning' | 'error'; text: string } | null>(null)
  const [checks, setChecks] = useState<{ at?: string; byName: Record<string, ImportCheck['outputs'][number]> } | null>(null)

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

  const sync = async (names?: string[]) => {
    setBusy(names?.[0] ?? '*')
    setNotice(null)
    const r = await DataImportService.sync({ force: true, names })
    setBusy(null)
    if (!r.data) return setNotice({ intent: 'error', text: r.error ?? '' })
    take(r.data)
    const label = (n: string) => bqOutputLabel(n)
    if (r.data.imported.length) onImported()
    if (r.data.failed.length)
      setNotice({ intent: 'warning', text: t('取り込めなかった出力があります(前のデータのまま使います): ', 'Some outputs were not imported (the previous data is kept): ') + r.data.failed.map((f) => `${label(f.name)} — ${f.message}`).join(' / ') })
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
    const byName = Object.fromEntries(r.data.outputs.map((c) => [c.name, c]))
    // 1 つだけ確かめたときは、ほかの出力の前の結果を残す
    setChecks((prev) => ({ at: r.data!.checkedAt, byName: names?.length ? { ...prev?.byName, ...byName } : byName }))
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
  const stopped = status.outputs.filter((o) => o.status === 'error')
  const stale = status.outputs.filter((o) => o.status !== 'error' && o.stale)
  return (
    <div className={s.root}>
      <div className={s.bar}>
        {/* ラベルの ⓘ を押せるように、Switch の label に入れずに横に並べる */}
        <InfoLabel
          info={
            status.auto.envDisabled
              ? t('サーバーの設定(BQ_AUTO_SYNC=0)で止めています。入れるには、その設定を外してサーバーを起動し直してください。', 'Stopped by the server setting (BQ_AUTO_SYNC=0). Remove it and restart the server to turn this on.')
              : t('入にすると、サーバーが出力ごとの間隔で BigQuery を確かめ、変わっていれば取り込みます(画面を開いていなくても)。切のあいだは、画面を開いたときに確かめます。', 'When on, the server checks BigQuery at each output’s interval and imports changes, even with no one using the app. When off, it checks when someone opens the app.')
          }
        >
          {t('定期の取り込み', 'Scheduled import')}
        </InfoLabel>
        <Switch
          checked={status.auto.enabled && !status.auto.envDisabled}
          disabled={!!busy || status.auto.envDisabled || !status.configured}
          aria-label={t('定期の取り込み', 'Scheduled import')}
          label={status.auto.envDisabled ? t('サーバーの設定で止めています', 'Stopped by the server setting') : status.auto.enabled ? t('入', 'On') : t('切', 'Off')}
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
      {(stopped.length > 0 || stale.length > 0) && (
        <MessageBar intent={stopped.length ? 'error' : 'warning'} layout="multiline">
          <MessageBarBody>
            <MessageBarTitle>{stopped.length ? t('止めた出力があります', 'Some outputs are stopped') : t('古いデータがあります', 'Some data is stale')}</MessageBarTitle>
            {[
              ...stopped.map((o) => t(`${bqOutputLabel(o.name)}: 前のデータのまま使っています`, `${bqOutputLabel(o.name)}: still using the previous data`)),
              ...stale.map((o) => t(`${bqOutputLabel(o.name)}: データの時点が ${when(o.dataAsOf)} のままです`, `${bqOutputLabel(o.name)}: data is still as of ${when(o.dataAsOf)}`)),
            ].join(' / ')}
          </MessageBarBody>
        </MessageBar>
      )}
      {notice && (
        <MessageBar intent={notice.intent} layout="multiline">
          <MessageBarBody>{notice.text}</MessageBarBody>
        </MessageBar>
      )}
      {checks && (
        <MessageBar intent="info" layout="multiline">
          <MessageBarBody>
            {t(`確認だけの結果(${when(checks.at)})。何も書き込んでいません。`, `Check-only results (${when(checks.at)}). Nothing was written.`)}
          </MessageBarBody>
        </MessageBar>
      )}
      {!status.configured && (
        <div className={s.note}>{t('BigQuery の出力が、まだ 1 つも設定されていません(サーバーの設定 BQ_SPU など)。', 'No BigQuery outputs are set yet (server settings such as BQ_SPU).')}</div>
      )}
      <div className={s.list}>
        {status.outputs.map((o) => (
          <OutputItem
            key={o.name}
            o={o}
            auto={status.auto}
            busy={!!busy}
            working={busy === o.name}
            check={checks?.byName[o.name]}
            onSync={() => void sync([o.name])}
            onCheck={() => void check([o.name])}
            onInterval={(min) => void saveSettings({ interval: [o.name, min] })}
          />
        ))}
      </div>
      {status.unconfigured.length > 0 && (
        <div className={s.unconfigured}>
          <LabeledValue label={t('未設定', 'Not set')} layout="stacked">
            {status.unconfigured.map((u) => `${outputLabel(u.name, u.label)}(${u.env})`).join(t('・', ', '))}
          </LabeledValue>
        </div>
      )}
    </div>
  )
}
