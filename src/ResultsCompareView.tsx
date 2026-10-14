import { Fragment, useMemo, useState } from 'react'
import { Button, Field, Input, MessageBar, MessageBarBody, Select, Spinner, ToggleButton, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import type { Cr854_heroimages } from './generated/models/Cr854_heroimagesModel'
import { AiIcon } from './AiMark'
import { evaluateLineup, type CompareVerdict } from './aiCompare'
import { HeatPreview } from './HeatPreview'
import { locale, useT } from './i18n'
import { isPush, pct, positionLabel, positionShares, sentAtOf, templateIdOf, templateName, type ResultRow } from './results'
import { getTemplate } from './templates'
import { THEME_TYPES, themeTypeLabel, themeTypeOf } from './themeTypes'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '14px' },
  // 比べる条件: ツールバー(画面の切り替え)ではなく、画面の中身の一部に見えるよう、枠と見出しを付ける
  filters: { display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', columnGap: '12px', rowGap: '8px', padding: '10px 12px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  filtersTitle: { flexBasis: '100%', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  field: { minWidth: '180px' },
  ns: { display: 'flex', alignItems: 'center', columnGap: '4px' },
  count: { marginLeft: 'auto', color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  muted: { color: tokens.colorNeutralForeground3 },
  // 並べた配信(古い順に左から)
  lineup: { display: 'flex', columnGap: '12px', overflowX: 'auto', paddingBottom: '8px', alignItems: 'flex-start' },
  col: {
    display: 'grid',
    rowGap: '6px',
    width: '196px',
    flexShrink: 0,
    padding: '8px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    font: 'inherit',
    textAlign: 'left',
    ':hover': { boxShadow: tokens.shadow4 },
  },
  colBest: { border: `2px solid ${tokens.colorPaletteGreenBorderActive}` },
  colWorst: { border: `2px solid ${tokens.colorPaletteRedBorderActive}` },
  colHead: { display: 'grid', rowGap: '1px', fontSize: tokens.fontSizeBase200 },
  colName: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  colSub: { color: tokens.colorNeutralForeground3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  heat: { display: 'flex', justifyContent: 'center' },
  // 配信 × 数字・位置 の表。行ごとに、良いほど濃い緑
  tableWrap: { overflowX: 'auto', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium },
  table: { borderCollapse: 'collapse', fontSize: tokens.fontSizeBase200, fontVariantNumeric: 'tabular-nums', width: '100%' },
  th: { padding: '6px 10px', textAlign: 'right', borderBottom: `1px solid ${tokens.colorNeutralStroke1}`, backgroundColor: tokens.colorNeutralBackground2, whiteSpace: 'nowrap', fontWeight: tokens.fontWeightSemibold },
  rowHead: { padding: '5px 10px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, position: 'sticky', left: 0, backgroundColor: tokens.colorNeutralBackground1 },
  cell: { padding: '5px 10px', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  section: { backgroundColor: tokens.colorNeutralBackground3, fontWeight: tokens.fontWeightSemibold, padding: '4px 10px', textAlign: 'left' },
  // AI の評価
  ai: { display: 'grid', rowGap: '10px', padding: '12px 14px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  aiHead: { display: 'flex', alignItems: 'center', columnGap: '10px', flexWrap: 'wrap' },
  h3: { margin: 0, fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold },
  h4: { margin: '0 0 4px', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  sub: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  aiCols: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', columnGap: '16px', rowGap: '10px' },
  item: { display: 'flex', alignItems: 'flex-start', columnGap: '6px', fontSize: tokens.fontSizeBase300, paddingBottom: '4px' },
  itemText: { flexGrow: 1, overflowWrap: 'anywhere' },
  adopted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, whiteSpace: 'nowrap' },
  adoptBtn: { flexShrink: 0, whiteSpace: 'nowrap', minWidth: 'auto' },
  jump: { border: 'none', background: 'none', padding: 0, font: 'inherit', fontWeight: tokens.fontWeightSemibold, color: tokens.colorBrandForeground1, textDecoration: 'underline', cursor: 'pointer' },
  colFlash: { outline: `3px solid ${tokens.colorBrandStroke1}`, outlineOffset: '2px' },
})

const NS = [5, 10, 20] as const

interface Props {
  /** 結果のある配信(共通のツールバーの絞り込みをかけたもの) */
  rows: ResultRow[]
  cardProducts: Map<string, string[]>
  products: Cr854_products[]
  heroes: Cr854_heroimages[]
  money: (v: number | undefined, card: Cr854_deliverycards) => string
  /** 配信の詳しい結果を開く */
  onOpen: (cardId: string) => void
  /** AI の評価を、配信の「次に生かすメモ」に入れる */
  onAdopt: (row: ResultRow, text: string) => Promise<void>
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0)

/**
 * 結果の面の「比べる」。人が配信カードの項目(テンプレート・テーマの種類・配信名、ツールバーの国・チャネル・種別)で絞り込み、
 * 直近 n 回の配信を、古い順に並べて比べる。並べた結果を、AI が見比べて評価する
 */
export function ResultsCompareView({ rows, cardProducts, products, heroes, money, onOpen, onAdopt }: Props) {
  const styles = useStyles()
  const t = useT()
  // 比べる条件。テンプレートは、最初は、いちばん多く使っているもの(同じテンプレートの過去 5 回を、すぐ比べられるように)
  const templateIds = useMemo(() => {
    const count = new Map<string, number>()
    for (const r of rows) count.set(templateIdOf(r.card), (count.get(templateIdOf(r.card)) ?? 0) + 1)
    return [...count].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, n }))
  }, [rows])
  const [template, setTemplate] = useState<string | null>(null)
  const tpl = template ?? templateIds[0]?.id ?? ''
  const [themeType, setThemeType] = useState('')
  const [query, setQuery] = useState('')
  const [n, setN] = useState<number>(5)
  const [verdict, setVerdict] = useState<CompareVerdict | null>(null)
  const [evaluating, setEvaluating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adopted, setAdopted] = useState<Set<string>>(new Set())

  const ms = (r: ResultRow) => new Date(sentAtOf(r) ?? 0).getTime()
  const matched = rows
    .filter((r) => (!tpl || templateIdOf(r.card) === tpl) && (!themeType || themeTypeOf(r.card).type === themeType) && (!query.trim() || (r.card.cr854_name ?? '').toLowerCase().includes(query.trim().toLowerCase())))
    .sort((a, b) => ms(b) - ms(a))
  // 直近 n 回を、古い順(左から右へ、時間の流れ)に並べる
  const lineup = matched.slice(0, n).reverse()
  const latest = lineup[lineup.length - 1]
  const sameTemplate = lineup.length > 0 && lineup.every((r) => templateIdOf(r.card) === templateIdOf(lineup[0].card))
  const idsOf = (r: ResultRow) => cardProducts.get(r.card.cr854_deliverycardid) ?? []
  const productName = (id: string) => products.find((p) => p.cr854_productid === id)?.cr854_name ?? ''
  const perRecipient = (r: ResultRow) => (r.result.cr854_recipients ? r.revenue / r.result.cr854_recipients : undefined)
  const shares = lineup.map((r) => positionShares(r, idsOf(r)))

  // 表の行: 数字と、(テンプレートが揃っているときだけ)位置ごとのクリックの割合
  type Line = { key: string; label: string; values: (number | undefined)[]; show: (v: number | undefined, r: ResultRow) => string; section?: string }
  const lines: Line[] = [
    { key: 'open', label: t('開封率', 'Open rate'), values: lineup.map((r) => r.openRate), show: (v) => pct(v), section: t('数字', 'Figures') },
    { key: 'click', label: t('クリック率(アプリはタップ率)', 'Click rate (app: tap rate)'), values: lineup.map((r) => r.clickRate), show: (v) => pct(v) },
    { key: 'revenue', label: t('売上', 'Revenue'), values: lineup.map((r) => r.revenue), show: (v, r) => money(v, r.card) },
    { key: 'rpr', label: t('1 通あたりの売上', 'Revenue per recipient'), values: lineup.map(perRecipient), show: (v) => (v === undefined ? '—' : v.toFixed(2)) },
    { key: 'orders', label: t('注文', 'Orders'), values: lineup.map((r) => r.result.cr854_orders), show: (v) => (v === undefined ? '—' : Math.round(v).toLocaleString(locale())) },
    ...(sameTemplate
      ? [...(shares[0]?.keys() ?? [])]
          .filter((k) => k !== 'other')
          .map((k, i): Line => ({ key: k, label: positionLabel(k, t), values: shares.map((m) => m.get(k)), show: (v) => pct(v), section: i === 0 ? t('位置ごとのクリックの割合', 'Share of clicks by position') : undefined }))
      : []),
  ]
  // 行の中で、良いほど濃い緑(比べられる値が 2 つ以上あるときだけ)
  const shade = (vals: (number | undefined)[], v: number | undefined) => {
    const xs = vals.filter((x): x is number => x !== undefined)
    if (v === undefined || xs.length < 2) return undefined
    const lo = Math.min(...xs)
    const hi = Math.max(...xs)
    if (hi === lo) return undefined
    return `rgba(16, 124, 16, ${(0.06 + 0.32 * ((v - lo) / (hi - lo))).toFixed(3)})`
  }

  const dateText = (r: ResultRow) => {
    const s = sentAtOf(r)
    return s ? new Date(s).toLocaleDateString(locale(), { month: 'numeric', day: 'numeric' }) : ''
  }
  const describeFilters = () =>
    [
      tpl ? `${t('テンプレート', 'Template')}: ${getTemplate(tpl).label}` : '',
      themeType ? `${t('テーマの種類', 'Theme type')}: ${themeTypeLabel(themeType as never)}` : '',
      query.trim() ? `${t('配信名', 'Name')}: ${query.trim()}` : '',
      t(`直近 ${n} 回`, `last ${n}`),
    ]
      .filter(Boolean)
      .join(' / ')

  const evaluate = async () => {
    setEvaluating(true)
    setError(null)
    try {
      setVerdict(
        await evaluateLineup({
          filters: describeFilters(),
          deliveries: lineup.map((r, i) => ({
            id: r.card.cr854_deliverycardid,
            date: (sentAtOf(r) ?? '').slice(0, 10),
            name: r.card.cr854_name,
            theme: r.card.cr854_theme,
            themeType: themeTypeOf(r.card).type,
            template: templateName(r.card),
            headline: isPush(r.card) ? r.card.cr854_pushtitle : r.card.cr854_headline,
            slots: idsOf(r).map(productName),
            kpis: { openRate: r.openRate, clickRate: r.clickRate, revenue: r.revenue, revenuePerRecipient: perRecipient(r), orders: r.result.cr854_orders },
            positions: sameTemplate ? Object.fromEntries([...shares[i]].filter(([k]) => k !== 'other')) : {},
          })),
        }),
      )
      setAdopted(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setEvaluating(false)
    }
  }
  const adopt = async (text: string) => {
    if (!latest) return
    await onAdopt(latest, text)
    setAdopted((s) => new Set(s).add(text))
  }
  const nameOf = (id: string) => {
    const r = lineup.find((x) => x.card.cr854_deliverycardid === id)
    return r ? `${dateText(r)} ${r.card.cr854_name}` : id
  }
  // 評価の配信名から、その配信の列へ移って、しばらく光らせる
  const [flash, setFlash] = useState<string | null>(null)
  const focusCol = (id: string) => {
    document.getElementById(`cmp-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    setFlash(id)
    window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 1600)
  }
  const bestIds = new Set(verdict?.best.map((b) => b.id))
  const worstIds = new Set(verdict?.worst.map((b) => b.id))

  return (
    <div className={styles.root}>
      <div className={styles.filters}>
        <span className={styles.filtersTitle}>{t('比べる配信の条件', 'Which deliveries to compare')}</span>
        <Field label={t('テンプレート', 'Template')} size="small" className={styles.field}>
          <Select size="small" value={tpl} onChange={(_, d) => { setTemplate(d.value); setVerdict(null) }}>
            <option value="">{t('すべて', 'All')}</option>
            {templateIds.map(({ id, n: count }) => (
              <option key={id} value={id}>{`${getTemplate(id).label}(${count})`}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('テーマの種類', 'Theme type')} size="small" className={styles.field}>
          <Select size="small" value={themeType} onChange={(_, d) => { setThemeType(d.value); setVerdict(null) }}>
            <option value="">{t('すべて', 'All')}</option>
            {THEME_TYPES.map((v) => (
              <option key={v} value={v}>{themeTypeLabel(v)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('配信名(含む)', 'Name contains')} size="small" className={styles.field}>
          <Input size="small" value={query} onChange={(_, d) => { setQuery(d.value); setVerdict(null) }} placeholder={t('例: Weekend Sale', 'e.g. Weekend Sale')} />
        </Field>
        <div className={styles.ns} role="group" aria-label={t('比べる回数', 'How many')}>
          <span className={styles.sub}>{t('直近', 'Last')}</span>
          {NS.map((v) => (
            <ToggleButton key={v} size="small" checked={n === v} appearance={n === v ? 'primary' : 'subtle'} onClick={() => { setN(v); setVerdict(null) }}>
              {t(`${v} 回`, `${v}`)}
            </ToggleButton>
          ))}
        </div>
        <span className={styles.count}>{t(`条件に合う配信 ${matched.length} 本のうち、直近 ${lineup.length} 本を古い順に並べています`, `Showing the latest ${lineup.length} of ${matched.length} matching deliveries, oldest first`)}</span>
      </div>

      {lineup.length === 0 ? (
        <div className={styles.muted}>{t('条件に合う、結果のある配信がありません', 'No deliveries with results match these filters')}</div>
      ) : (
        <>
          {/* AI の評価は、並びのすぐ上(評価を読みながら、下のヒートマップを見られるように) */}
          <div className={styles.ai}>
            <div className={styles.aiHead}>
              <h3 className={styles.h3}>{t('AI の評価', 'AI evaluation')}</h3>
              <Button size="small" appearance="primary" icon={evaluating ? <Spinner size="extra-tiny" /> : <AiIcon tone="white" size={16} />} onClick={() => void evaluate()} disabled={evaluating || lineup.length < 2}>
                {verdict ? t('もう一度評価する', 'Evaluate again') : t('並べた配信を AI で評価する', 'Evaluate this lineup with AI')}
              </Button>
              <span className={styles.sub}>
                {t(
                  `いま並んでいる ${lineup.length} 本(${describeFilters()})を、AI が見比べます。評価は保存しません。残したいものは「メモに採用」で、最新の配信(${latest ? nameOf(latest.card.cr854_deliverycardid) : ''})の次に生かすメモに入ります`,
                  `AI compares the ${lineup.length} deliveries shown (${describeFilters()}). Not saved; adopt lines into the notes of the latest delivery (${latest ? nameOf(latest.card.cr854_deliverycardid) : ''}).`,
                )}
              </span>
            </div>
            {error && (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            {verdict && (
              <>
                {verdict.summary && <div>{verdict.summary}</div>}
                <div className={styles.aiCols}>
                  {(
                    [
                      [t('良かった配信', 'Best'), verdict.best.map((b) => ({ id: b.id, x: b.why })), t('良かった', 'Best')],
                      [t('悪かった配信', 'Worst'), verdict.worst.map((b) => ({ id: b.id, x: b.why })), t('悪かった', 'Worst')],
                      [t('傾向', 'Findings'), verdict.findings.map((x) => ({ id: '', x })), t('傾向', 'Finding')],
                      [t('次に試すこと', 'Try next'), verdict.next.map((x) => ({ id: '', x })), t('次に試す', 'Try next')],
                    ] as const
                  ).map(([title, items, tag]) => (
                    <div key={title}>
                      <h4 className={styles.h4}>{title}</h4>
                      {items.length === 0 && <span className={styles.muted}>—</span>}
                      {items.map(({ id, x }) => {
                        const text = id ? `${tag}: ${nameOf(id)}: ${x}` : `${tag}: ${x}`
                        return (
                          <div key={x} className={styles.item}>
                            <span className={styles.itemText}>
                              {/* 配信名を押すと、その配信の列へ移って、光らせる(評価を読みながら、ヒートマップを見るため) */}
                              {id && (
                                <button type="button" className={styles.jump} onClick={() => focusCol(id)} title={t('この配信の列へ', 'Go to this delivery')}>
                                  {nameOf(id)}
                                </button>
                              )}
                              {id ? `: ${x}` : x}
                            </span>
                            {adopted.has(text) ? (
                              <span className={styles.adopted}>{t('採用済み', 'Adopted')}</span>
                            ) : (
                              <Button size="small" appearance="subtle" className={styles.adoptBtn} onClick={() => void adopt(text)}>
                                {t('メモに採用', 'Adopt')}
                              </Button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
                {verdict.confidence && <span className={styles.sub}>{t(`根拠の強さ: ${verdict.confidence}`, `Confidence: ${verdict.confidence}`)}</span>}
              </>
            )}
          </div>
          <div className={styles.lineup}>
            {lineup.map((r) => {
              const id = r.card.cr854_deliverycardid
              return (
                <button key={r.result.cr854_deliveryresultid} id={`cmp-${id}`} type="button" className={mergeClasses(styles.col, bestIds.has(id) && styles.colBest, worstIds.has(id) && styles.colWorst, flash === id && styles.colFlash)} onClick={() => onOpen(id)} title={t('詳しい結果を開く', 'Open the details')}>
                  <span className={styles.colHead}>
                    <span className={styles.colSub}>{`${dateText(r)} · ${isPush(r.card) ? t('アプリ', 'App') : t('メール', 'Email')}`}</span>
                    <span className={styles.colName}>{r.card.cr854_name}</span>
                    <span className={styles.colSub} title={r.card.cr854_theme}>{r.card.cr854_theme || '—'}</span>
                    {!sameTemplate && <span className={styles.colSub}>{templateName(r.card)}</span>}
                  </span>
                  <span className={styles.heat}>
                    <HeatPreview row={r} productIds={idsOf(r)} products={products} heroes={heroes} width={178} compact />
                  </span>
                </button>
              )
            })}
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th} style={{ textAlign: 'left' }} />
                  {lineup.map((r) => (
                    <th key={r.result.cr854_deliveryresultid} className={styles.th} title={r.card.cr854_name}>
                      {dateText(r)}
                    </th>
                  ))}
                  <th className={styles.th}>{t('平均', 'Average')}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <Fragment key={l.key}>
                    {l.section && (
                      <tr>
                        <td className={styles.section} colSpan={lineup.length + 2}>{l.section}</td>
                      </tr>
                    )}
                    <tr>
                      <td className={styles.rowHead}>{l.label}</td>
                      {lineup.map((r, i) => (
                        <td key={r.result.cr854_deliveryresultid} className={styles.cell} style={{ backgroundColor: shade(l.values, l.values[i]) }}>
                          {l.show(l.values[i], r)}
                        </td>
                      ))}
                      <td className={styles.cell}>
                        {l.values.some((v) => v !== undefined) ? l.show(avg(l.values.filter((v): v is number => v !== undefined)), lineup[0]) : '—'}
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {!sameTemplate && (
            <span className={styles.sub}>{t('テンプレートが違う配信が混ざっているので、位置ごとの比べは出していません。テンプレートで絞り込むと出ます', 'Templates differ, so positions are not compared. Filter by template to see them.')}</span>
          )}

        </>
      )}
    </div>
  )
}
