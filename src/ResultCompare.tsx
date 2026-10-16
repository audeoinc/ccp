import { useState } from 'react'
import { Button, MessageBar, MessageBarBody, Spinner, ToggleButton, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AiIcon } from './AiMark'
import { reviewResult, type ResultReview } from './aiReview'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { HeatPreview } from './HeatPreview'
import { locale, useT } from './i18n'
import { isPush, pastSame, pct, positionLabel, positionShares, sentAtOf, templateIdOf, templateName, type CompareBy, type ResultRow } from './results'
import { themeTypeLabel, themeTypeOf } from './themeTypes'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '12px', paddingTop: '16px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  head: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: '12px', rowGap: '6px' },
  h3: { margin: 0, fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold },
  sub: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  ns: { display: 'flex', alignItems: 'center', columnGap: '4px', marginLeft: 'auto' },
  muted: { color: tokens.colorNeutralForeground3 },
  // 数字の比べ | 位置ごとの比べ | 過去の配信のプレビュー
  grid: { display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 1.2fr)', columnGap: '24px', rowGap: '16px', alignItems: 'start' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: tokens.fontSizeBase300, fontVariantNumeric: 'tabular-nums' },
  th: { textAlign: 'left', padding: '5px 8px', borderBottom: `1px solid ${tokens.colorNeutralStroke1}`, fontWeight: tokens.fontWeightSemibold, whiteSpace: 'nowrap' },
  td: { padding: '5px 8px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  num: { textAlign: 'right', whiteSpace: 'nowrap' },
  up: { color: tokens.colorPaletteGreenForeground1 },
  down: { color: tokens.colorPaletteRedForeground1 },
  // 今回と過去の平均を、2 本の棒で並べる
  bars: { display: 'grid', rowGap: '2px', width: '120px' },
  barNow: { height: '6px', borderRadius: '3px', backgroundColor: 'rgba(230, 81, 0, 0.85)' },
  barPast: { height: '6px', borderRadius: '3px', backgroundColor: tokens.colorNeutralStroke1 },
  strip: { display: 'flex', columnGap: '12px', overflowX: 'auto', paddingBottom: '6px' },
  card: {
    display: 'grid',
    rowGap: '4px',
    alignContent: 'start',
    padding: '6px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    font: 'inherit',
    textAlign: 'left',
    flexShrink: 0,
    ':hover': { boxShadow: tokens.shadow4 },
  },
  cardHead: { display: 'flex', justifyContent: 'space-between', columnGap: '6px', fontSize: tokens.fontSizeBase200, fontVariantNumeric: 'tabular-nums' },
  heat: { display: 'flex', justifyContent: 'center' },
  // AI の振り返り
  review: { display: 'grid', rowGap: '10px', padding: '12px 14px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
  reviewHead: { display: 'flex', alignItems: 'center', columnGap: '10px', flexWrap: 'wrap' },
  reviewCols: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '16px', rowGap: '10px' },
  reviewH: { margin: '0 0 4px', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  reviewItem: { display: 'flex', alignItems: 'flex-start', columnGap: '6px', fontSize: tokens.fontSizeBase300, paddingBottom: '4px' },
  reviewText: { flexGrow: 1, overflowWrap: 'anywhere' },
  adopted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, whiteSpace: 'nowrap' },
})

const NS = [3, 5, 10] as const

interface Props {
  row: ResultRow
  /** すべての配信の結果(この中から、比べる相手を探す) */
  history: ResultRow[]
  cardProducts: Map<string, string[]>
  products: Product[]
  heroes: HeroImage[]
  money: (v?: number) => string
  /** 過去の配信の結果を開く */
  onOpenOther?: (cardId: string) => void
  /** AI の振り返りを「次に生かすメモ」に入れる */
  onAdopt?: (text: string) => Promise<void>
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : undefined)

/**
 * 同じテンプレートの、過去の配信と比べる。数字(開封率・クリック率・1 通あたりの売上)と、位置ごとのクリックの割合を、
 * 過去 n 回の平均と並べる。同じテンプレートなら、枠の位置が同じなので、「どの位置が、いつもより押された / 押されなかった」がわかる
 */
export function ResultCompare({ row, history, cardProducts, products, heroes, money, onOpenOther, onAdopt }: Props) {
  const styles = useStyles()
  const t = useT()
  const [n, setN] = useState<number>(5)
  const [by, setBy] = useState<CompareBy>('template')
  const past = pastSame(history, row, n, by)
  const myType = themeTypeOf(row.card)
  const push = isPush(row.card)
  const idsOf = (r: ResultRow) => cardProducts.get(r.card.id) ?? []

  const delta = (now?: number, base?: number, unit: 'pt' | 'pct' = 'pct') => {
    if (now === undefined || base === undefined || (unit === 'pct' && !base)) return <span className={styles.muted}>—</span>
    const d = unit === 'pt' ? (now - base) * 100 : (now / base - 1) * 100
    if (Math.abs(d) < 0.05) return <span className={styles.muted}>±0</span>
    return <span className={d > 0 ? styles.up : styles.down}>{`${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}${unit === 'pt' ? 'pt' : '%'}`}</span>
  }

  const perRecipient = (r: ResultRow) => (r.result.recipients ? r.revenue / r.result.recipients : undefined)
  const kpis: { label: string; now?: number; base?: number; show: (v?: number) => string; unit: 'pt' | 'pct' }[] = [
    ...(push ? [] : [{ label: t('開封率', 'Open rate'), now: row.openRate, base: avg(past.map((p) => p.openRate ?? 0)), show: pct, unit: 'pt' as const }]),
    { label: push ? t('タップ率', 'Tap rate') : t('クリック率', 'Click rate'), now: row.clickRate, base: avg(past.map((p) => p.clickRate ?? 0)), show: pct, unit: 'pt' },
    { label: t('売上', 'Revenue'), now: row.revenue, base: avg(past.map((p) => p.revenue)), show: money, unit: 'pct' },
    {
      label: t('1 通あたりの売上', 'Revenue per recipient'),
      now: perRecipient(row),
      base: avg(past.map(perRecipient).filter((v): v is number => v !== undefined)),
      // 1 通あたりは小さい数なので、小数 2 桁で(通貨の記号は、売上の行と同じ)
      show: (v) => (v === undefined ? '—' : `${money(0).replace(/[\d,.]+/, '')}${v.toFixed(2)}`),
      unit: 'pct',
    },
  ]

  // 位置ごと: 今回の位置を基準に、過去の同じ位置の平均と比べる
  const nowShares = positionShares(row, idsOf(row))
  const pastShares = past.map((p) => positionShares(p, idsOf(p)))
  const keys = [...nowShares.keys()].filter((k) => k !== 'other')
  const positions = keys.map((k) => ({ key: k, now: nowShares.get(k) ?? 0, base: avg(pastShares.map((m) => m.get(k)).filter((v): v is number => v !== undefined)) }))
  // 位置で比べられるのは、テンプレートが同じときだけ(テンプレートが違うと、同じ番号の枠でも、大きさ・場所が違う)
  const sameTemplate = past.every((p) => templateIdOf(p.card) === templateIdOf(row.card))

  // AI の振り返り(保存しない。採用したものだけ、メモに入れる)
  const [review, setReview] = useState<ResultReview | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [adopted, setAdopted] = useState<Set<string>>(new Set())
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? ''
  const runReview = async () => {
    setReviewing(true)
    setReviewError(null)
    try {
      const tt = themeTypeOf(row.card)
      setReview(
        await reviewResult({
          delivery: {
            name: row.card.name,
            theme: row.card.theme,
            themeType: tt.type,
            template: templateName(row.card),
            headline: push ? row.card.push_title : row.card.headline,
            channel: push ? 'push' : 'email',
          },
          compareBy: by,
          past: past.length,
          kpis: kpis.map((k) => ({ name: k.label, now: k.now ?? 0, past: k.base ?? 0, rate: k.unit === 'pt' })),
          positions: sameTemplate ? positions.map((p) => ({ key: p.key, now: p.now, past: p.base ?? 0 })) : [],
          slots: idsOf(row).map(productName),
        }),
      )
      setAdopted(new Set())
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : String(e))
    } finally {
      setReviewing(false)
    }
  }
  const adopt = async (text: string) => {
    await onAdopt?.(text)
    setAdopted((s) => new Set(s).add(text))
  }

  const dateText = (r: ResultRow) => {
    const s = sentAtOf(r)
    return s ? new Date(s).toLocaleDateString(locale(), { month: 'numeric', day: 'numeric' }) : ''
  }

  return (
    <section className={styles.root}>
      <div className={styles.head}>
        <h3 className={styles.h3}>{t('過去の配信と比べる', 'Compare with past deliveries')}</h3>
        {/* 印刷では、切り替えのボタンの代わりに、比べた相手を文字で出す */}
        <span className={styles.sub} data-print-only>
          {by === 'template'
            ? t(`同じテンプレート(${templateName(row.card)})・過去 ${past.length} 回と比べた`, `Compared with the last ${past.length} with the same template (${templateName(row.card)})`)
            : t(`同じテーマの種類(${themeTypeLabel(myType.type)})・過去 ${past.length} 回と比べた`, `Compared with the last ${past.length} of the same theme type (${themeTypeLabel(myType.type)})`)}
        </span>
        <span className={styles.ns} style={{ marginLeft: 0 }} role="group" aria-label={t('比べる相手', 'Compare with')} data-noprint>
          {(
            [
              ['template', t(`同じテンプレート(${templateName(row.card)})`, `Same template (${templateName(row.card)})`)],
              ['themeType', t(`同じテーマの種類(${themeTypeLabel(myType.type)}${myType.guessed ? '・推定' : ''})`, `Same theme type (${themeTypeLabel(myType.type)}${myType.guessed ? ', guessed' : ''})`)],
            ] as const
          ).map(([k, label]) => (
            <ToggleButton key={k} size="small" checked={by === k} appearance={by === k ? 'primary' : 'subtle'} onClick={() => setBy(k)}>
              {label}
            </ToggleButton>
          ))}
        </span>
        <span className={styles.sub}>{t('同じ国とチャネルで、この配信より前に送ったもの', 'Same country and channel, sent before this one')}</span>
        <span className={styles.ns} role="group" aria-label={t('比べる回数', 'How many')} data-noprint>
          <span className={styles.sub}>{t('過去', 'Last')}</span>
          {NS.map((v) => (
            <ToggleButton key={v} size="small" checked={n === v} appearance={n === v ? 'primary' : 'subtle'} onClick={() => setN(v)}>
              {t(`${v} 回`, `${v}`)}
            </ToggleButton>
          ))}
        </span>
      </div>
      {past.length === 0 ? (
        <div className={styles.muted}>{t('同じ条件の、過去の配信の結果がまだありません', 'No past results that match yet')}</div>
      ) : (
        <>
          <div className={styles.grid}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th} />
                  <th className={mergeClasses(styles.th, styles.num)}>{t('今回', 'This one')}</th>
                  <th className={mergeClasses(styles.th, styles.num)}>{t(`過去 ${past.length} 回の平均`, `Avg of last ${past.length}`)}</th>
                  <th className={mergeClasses(styles.th, styles.num)}>{t('差', 'Diff')}</th>
                </tr>
              </thead>
              <tbody>
                {kpis.map((k) => (
                  <tr key={k.label}>
                    <td className={styles.td}>{k.label}</td>
                    <td className={mergeClasses(styles.td, styles.num)}>{k.show(k.now)}</td>
                    <td className={mergeClasses(styles.td, styles.num)}>{k.show(k.base)}</td>
                    <td className={mergeClasses(styles.td, styles.num)}>{delta(k.now, k.base, k.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!sameTemplate ? (
              <div className={styles.muted}>{t('テンプレートが違う配信が混ざっているので、位置ごとの比べは出しません(同じ番号の枠でも、大きさ・場所が違うため)', 'Templates differ, so positions are not compared (the same slot number can be a different size and place)')}</div>
            ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>{t('位置(クリックの割合)', 'Position (share of clicks)')}</th>
                  <th className={mergeClasses(styles.th, styles.num)}>{t('今回', 'This one')}</th>
                  <th className={mergeClasses(styles.th, styles.num)}>{t('過去の平均', 'Past avg')}</th>
                  <th className={mergeClasses(styles.th, styles.num)}>{t('差', 'Diff')}</th>
                  <th className={styles.th} />
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.key}>
                    <td className={styles.td}>{positionLabel(p.key, t)}</td>
                    <td className={mergeClasses(styles.td, styles.num)}>{pct(p.now)}</td>
                    <td className={mergeClasses(styles.td, styles.num)}>{pct(p.base)}</td>
                    <td className={mergeClasses(styles.td, styles.num)}>{delta(p.now, p.base, 'pt')}</td>
                    <td className={styles.td}>
                      <div className={styles.bars} title={t('上: 今回 / 下: 過去の平均', 'Top: this one / bottom: past average')}>
                        <div className={styles.barNow} style={{ width: `${Math.min(100, p.now * 250)}%` }} />
                        <div className={styles.barPast} style={{ width: `${Math.min(100, (p.base ?? 0) * 250)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
          {/* 振り返りをまだ出していないときは、印刷しない */}
          <div className={styles.review} data-print-avoid {...(review ? {} : { 'data-noprint': true })}>
            <div className={styles.reviewHead}>
              <h3 className={styles.reviewH} style={{ margin: 0 }}>{t('AI の振り返り', 'AI review')}</h3>
              <Button data-noprint size="small" appearance="primary" icon={reviewing ? <Spinner size="extra-tiny" /> : <AiIcon tone="white" size={16} />} onClick={() => void runReview()} disabled={reviewing}>
                {review ? t('もう一度振り返る', 'Review again') : t('AI で振り返る', 'Review with AI')}
              </Button>
              <span className={styles.sub} data-noprint>
                {t('上の比べ(今の比べる相手・回数)を、AI が言葉にします。振り返りは保存しません。残したいものは「メモに採用」してください', 'AI puts the comparison above into words. The review is not saved; adopt what you want to keep into the notes.')}
              </span>
            </div>
            {reviewError && (
              <MessageBar intent="error">
                <MessageBarBody>{reviewError}</MessageBarBody>
              </MessageBar>
            )}
            {review && (
              <>
                <div className={styles.reviewCols}>
                  {(
                    [
                      [t('良かったこと', 'What worked'), review.good, t('良かった', 'Worked')],
                      [t('悪かったこと', 'What did not'), review.bad, t('悪かった', 'Did not work')],
                      [t('次に試すこと', 'Try next'), review.next, t('次に試す', 'Try next')],
                    ] as const
                  ).map(([title, items, tag]) => (
                    <div key={title}>
                      <h4 className={styles.reviewH}>{title}</h4>
                      {items.length === 0 && <span className={styles.muted}>—</span>}
                      {items.map((x) => {
                        const text = `${tag}: ${x}`
                        return (
                          <div key={x} className={styles.reviewItem}>
                            <span className={styles.reviewText}>{x}</span>
                            {onAdopt &&
                              (adopted.has(text) ? (
                                <span className={styles.adopted} data-noprint>{t('採用済み', 'Adopted')}</span>
                              ) : (
                                <Button data-noprint size="small" appearance="subtle" onClick={() => void adopt(text)}>
                                  {t('メモに採用', 'Adopt')}
                                </Button>
                              ))}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
                {review.confidence && <span className={styles.sub}>{t(`根拠の強さ: ${review.confidence}`, `Confidence: ${review.confidence}`)}</span>}
              </>
            )}
          </div>
          <div className={styles.strip} data-print-wrap>
            {past.map((p) => (
              <button key={p.result.id} type="button" className={styles.card} onClick={() => onOpenOther?.(p.card.id)} title={t('この配信の結果を開く', 'Open these results')}>
                <span className={styles.cardHead}>
                  <span>{dateText(p)}</span>
                  <span>{money(p.revenue)}</span>
                </span>
                {by === 'themeType' && <span className={styles.sub}>{p.card.name}</span>}
                <span className={styles.heat}>
                  <HeatPreview row={p} productIds={idsOf(p)} products={products} heroes={heroes} width={150} maxHeight={320} compact />
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
