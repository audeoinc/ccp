// 取り込んだデータの一覧(settings.datalist。X105。2026-11-03 利用者)。だれでも読むだけ。
// きっかけ: 見本の商品が入っていたために取り込みが止まったのに、何が入っているかを画面で確かめる道がなかった。
// 6 つの出力を、この 1 つの部品で切り替える。列はサーバーが schema.json から返す(出力ごとに作り込まない)。
// 止まっている・古いときは、一覧の上に理由を 1 行で出す(だれでもが見る所で、止まっていることに気づけるように)。
// 見本を消すボタンは置かない(管理の「データの取り込み」の側だけ)。サーバーは server/ccp/datalist.py
import { useEffect, useRef, useState } from 'react'
import {
  Badge,
  Button,
  Link,
  MessageBar,
  MessageBarBody,
  SearchBox,
  Spinner,
  Tab,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import { ArrowDownloadRegular, ChevronLeftRegular, ChevronRightRegular } from '@fluentui/react-icons'
import { DataImportService, type ImportOutput, type ImportStatus } from './data/dataImport'
import { DataListService, type DataListPage, type DataListRow } from './data/dataList'
import { useFeature } from './featureFlags'
import { bqOutputLabel } from './gcp/bq'
import { DATA_OUTPUTS, cellText, columnLabel, productPageUrl, toCsv } from './importedData'
import { LabeledValue } from './LabeledValue'
import { locale, useT } from './i18n'

const PAGE = 100
/** CSV は、この行数ずつ読んでつなぐ */
const CSV_PAGE = 5000

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM, minWidth: 0 },
  summary: { display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalXL, rowGap: tokens.spacingVerticalXS },
  bar: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalS },
  search: { flexGrow: 1, maxWidth: '420px' },
  right: { marginLeft: 'auto', display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS },
  // 列が多い出力があるので、表だけを横に動かす(窓の幅は変えない)
  scroll: { overflowX: 'auto', minWidth: 0 },
  table: { width: 'max-content', minWidth: '100%' },
  cell: { maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  head: { whiteSpace: 'nowrap' },
  dim: { color: tokens.colorNeutralForeground3 },
  pager: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', columnGap: tokens.spacingHorizontalS, fontVariantNumeric: 'tabular-nums' },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
})

const when = (iso?: string | null): string =>
  iso ? new Date(iso).toLocaleString(locale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

/** 止まっている・古い・未設定のときの 1 行 */
function ImportNotice({ o, configured }: { o?: ImportOutput; configured: boolean }) {
  const t = useT()
  const ask = t('管理する人に、⚙ →「データの取り込み」を確認してもらってください。', 'Ask an admin to check ⚙ → Data import.')
  if (!o)
    return (
      <MessageBar intent="info" layout="multiline">
        <MessageBarBody>
          {configured
            ? t('この出力の場所は、まだ設定されていません。', 'The location of this output is not set yet.')
            : t('データの取り込みの場所は、まだ設定されていません。', 'Data import locations are not set yet.')}{' '}
          {ask}
        </MessageBarBody>
      </MessageBar>
    )
  if (o.status === 'error')
    return (
      <MessageBar intent="warning" layout="multiline">
        <MessageBarBody>
          {t('取り込みを止めています(前のデータのまま使っています)。', 'Import is stopped (the previous data is kept).')} {o.message} {ask}
        </MessageBarBody>
      </MessageBar>
    )
  if (o.stale)
    return (
      <MessageBar intent="warning" layout="multiline">
        <MessageBarBody>
          {t(`データが古くなっています(データの時点 ${when(o.dataAsOf)})。`, `The data is out of date (as of ${when(o.dataAsOf)}).`)} {ask}
        </MessageBarBody>
      </MessageBar>
    )
  return null
}

export function ImportedDataList({ initial = 'spu' }: { /** はじめに開く出力(管理の行の「一覧を見る」から) */ initial?: string }) {
  const s = useStyles()
  const t = useT()
  const patternsOn = useFeature('settings.shopurl')
  const [name, setName] = useState(initial)
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<DataListPage | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<ImportStatus | null>(null)
  const [csv, setCsv] = useState<number | null>(null)
  const [csvError, setCsvError] = useState('')
  // 古い応答が新しい応答を上書きしないように(打っている途中の検索・タブの切り替え)
  const asked = useRef(0)

  useEffect(() => {
    let alive = true
    void DataImportService.status().then((r) => {
      if (alive && r.data) setStatus(r.data)
    })
    return () => {
      alive = false
    }
  }, [])

  // 打ち終わるのを少し待ってから、検索する
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(q)
      setOffset(0)
    }, 250)
    return () => clearTimeout(id)
  }, [q])

  useEffect(() => {
    const me = ++asked.current
    void DataListService.page(name, { q: query, offset, limit: PAGE }).then((r) => {
      if (me !== asked.current) return
      if (r.data) {
        setPage(r.data)
        setError('')
      } else setError(r.error ?? '')
    })
  }, [name, query, offset])

  const choose = (next: string) => {
    setName(next)
    setOffset(0)
    setPage(null)
    setCsvError('')
  }

  const isProducts = name === 'spu'
  const pageOf = (r: DataListRow) => productPageUrl(r, patternsOn)

  const writeCsv = async () => {
    setCsv(0)
    setCsvError('')
    const head = page?.columns ?? []
    const lines: string[][] = []
    for (let at = 0; ; at += CSV_PAGE) {
      const r = await DataListService.page(name, { q: query, offset: at, limit: CSV_PAGE })
      if (!r.data) {
        setCsv(null)
        setCsvError(r.error ?? '')
        return
      }
      for (const row of r.data.rows) lines.push([row._sample ? t('見本', 'Sample') : '', ...head.map((c) => (isProducts && c.name === 'page_url' ? pageOf(row) : typeof row[c.name] === 'number' ? String(row[c.name]) : cellText(c, row[c.name])))])
      setCsv(lines.length)
      if (r.data.rows.length < CSV_PAGE) break
    }
    const blob = new Blob([toCsv([t('見本', 'Sample'), ...head.map((c) => columnLabel(c.name))], lines)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${name}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    setCsv(null)
  }

  const output = status?.outputs.find((o) => o.name === name)
  const fmt = (n: number) => n.toLocaleString(locale())
  const lastShown = page ? Math.min(offset + PAGE, page.matched) : 0

  return (
    <div className={s.root}>
      <TabList size="small" selectedValue={name} onTabSelect={(_, d) => choose(String(d.value))}>
        {DATA_OUTPUTS.map((o) => (
          <Tab key={o} value={o}>
            {bqOutputLabel(o)}
          </Tab>
        ))}
      </TabList>
      {status && <ImportNotice o={output} configured={status.configured} />}
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {page && (
        <div className={s.summary}>
          <LabeledValue label={t('件数', 'Rows')}>{fmt(page.total)}</LabeledValue>
          {page.byMarket.some((m) => m.market) && <LabeledValue label={t('市場ごと', 'By market')}>{page.byMarket.map((m) => `${m.market || '—'} ${fmt(m.rows)}`).join(' · ')}</LabeledValue>}
          {page.sample > 0 && <LabeledValue label={t('見本', 'Sample')}>{fmt(page.sample)}</LabeledValue>}
          <LabeledValue label={t('最後に取り込んだ', 'Last imported')} empty="none">{when(output?.importedAt)}</LabeledValue>
        </div>
      )}
      <div className={s.bar}>
        <SearchBox className={s.search} size="small" value={q} placeholder={t('この一覧を探す(コード・名前など)', 'Search this list (code, name, …)')} aria-label={t('この一覧を探す', 'Search this list')} onChange={(_, d) => setQ(d.value)} />
        <div className={s.right}>
          {csvError && <span className={s.note}>{csvError}</span>}
          <Button size="small" icon={<ArrowDownloadRegular />} disabled={!page || page.matched === 0 || csv !== null} onClick={() => void writeCsv()}>
            {csv !== null ? t(`書き出し中… ${fmt(csv)} 行`, `Exporting… ${fmt(csv)} rows`) : query.trim() ? t('絞り込んだ結果を CSV で書き出す', 'Export filtered rows as CSV') : t('CSV で書き出す', 'Export as CSV')}
          </Button>
        </div>
      </div>
      {!page && !error && <Spinner size="small" />}
      {page && page.rows.length === 0 && (
        <div className={s.note}>{page.total === 0 ? t('まだ何も入っていません。', 'Nothing here yet.') : t('当てはまる行はありません。', 'No matching rows.')}</div>
      )}
      {page && page.rows.length > 0 && (
        <>
          <div className={s.scroll}>
            <Table size="small" className={s.table} aria-label={bqOutputLabel(name)}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell aria-label={t('見本の印', 'Sample mark')} />
                  {page.columns.map((c) => (
                    <TableHeaderCell key={c.name} className={s.head}>
                      {columnLabel(c.name)}
                    </TableHeaderCell>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r._sample && <Badge size="small" appearance="outline" color="warning">{t('見本', 'Sample')}</Badge>}</TableCell>
                    {page.columns.map((c) => {
                      if (isProducts && c.name === 'page_url') {
                        const url = pageOf(r)
                        return (
                          <TableCell key={c.name} className={s.cell}>
                            {url ? (
                              <Link href={url} target="_blank" rel="noreferrer" title={url}>
                                {t('ページを開く', 'Open page')}
                              </Link>
                            ) : (
                              <span className={s.dim}>—</span>
                            )}
                          </TableCell>
                        )
                      }
                      const text = cellText(c, r[c.name])
                      return (
                        <TableCell key={c.name} className={s.cell} title={text}>
                          {text || <span className={s.dim}>—</span>}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className={s.pager}>
            <span className={s.note}>{t(`${fmt(offset + 1)}〜${fmt(lastShown)} 行 / ${fmt(page.matched)} 行`, `${fmt(offset + 1)}–${fmt(lastShown)} of ${fmt(page.matched)}`)}</span>
            <Button size="small" appearance="subtle" icon={<ChevronLeftRegular />} disabled={offset === 0} aria-label={t('前のページ', 'Previous page')} onClick={() => setOffset(Math.max(0, offset - PAGE))} />
            <Button size="small" appearance="subtle" icon={<ChevronRightRegular />} disabled={lastShown >= page.matched} aria-label={t('次のページ', 'Next page')} onClick={() => setOffset(offset + PAGE)} />
          </div>
        </>
      )}
    </div>
  )
}
