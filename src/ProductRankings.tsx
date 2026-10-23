import { useEffect, useState } from 'react'
import { Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import type { Product } from './models/products'
import { RANKING_CHANNELS, type ProductRanking, type RankingChannel } from './models/productRankings'
import { ProductRankingsService } from './data/productRankings'
import { locale, useT } from './i18n'
import { criteriaFor, useCountrySettings } from './countrySettings'
import { sentAtOf, type ResultRow } from './results'

const useStyles = makeStyles({
  head: { display: 'flex', alignItems: 'center', columnGap: '12px', marginBottom: '6px' },
  h3: { margin: 0, fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  topN: { display: 'inline-flex', alignItems: 'center', columnGap: '6px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, marginBottom: '6px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: tokens.fontSizeBase300, fontVariantNumeric: 'tabular-nums' },
  th: { padding: '4px 8px', borderBottom: `1px solid ${tokens.colorNeutralStroke1}`, fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap', textAlign: 'center' },
  // チャネルの見出し(3 列をまとめる)。チャネルの切れ目に線を引き、どの列がどのチャネルかを読みやすくする
  group: { borderLeft: `1px solid ${tokens.colorNeutralStroke2}`, color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase300 },
  td: { padding: '5px 8px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, textAlign: 'center', whiteSpace: 'nowrap' },
  first: { borderLeft: `1px solid ${tokens.colorNeutralStroke2}` },
  prod: { textAlign: 'left', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis' },
  slot: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, marginRight: '6px' },
  inTop: { color: tokens.colorPaletteGreenForeground1, fontWeight: tokens.fontWeightSemibold },
  outTop: { color: tokens.colorNeutralForeground3 },
  // 配信前の 4 週の印(古い順。上位なら塗り、圏外なら枠だけ、数字がなければ点線)
  dots: { display: 'inline-flex', columnGap: '3px', verticalAlign: 'middle', marginRight: '6px' },
  dot: { width: '9px', height: '9px', borderRadius: '2px', boxSizing: 'border-box', border: `1px solid ${tokens.colorNeutralStroke1}` },
  dotOn: { backgroundColor: tokens.colorPaletteGreenBackground3, border: `1px solid ${tokens.colorPaletteGreenBorder2}` },
  dotNone: { border: `1px dashed ${tokens.colorNeutralStroke2}` },
  muted: { color: tokens.colorNeutralForeground3 },
})

/** 週の始まり(月曜。週ごとの実績・順位の week_start と同じ)を YYYY-MM-DD で */
function weekStartOf(d: Date): string {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(m.getDate()).padStart(2, '0')}`
}

function addWeeks(week: string, n: number): string {
  const [y, m, d] = week.split('-').map(Number)
  return weekStartOf(new Date(y, m - 1, d + n * 7))
}

/**
 * 載せた商品の、販売チャネルごとの販売順位(数量)。
 * 配信前の 4 週で Top N に入った週の数(もともとの実力)と、配信の週・翌週の順位(配信のあと)を並べ、
 * 全社・EC では上位なのに配信経由では低い(配信が効いていない)、配信経由だけ上位(配信で動く商品)などを読めるようにする
 */
export function ProductRankings({ row, productIds, products }: { row: ResultRow; productIds: string[]; products: Product[] }) {
  const styles = useStyles()
  const t = useT()
  useCountrySettings()
  const [rankings, setRankings] = useState<ProductRanking[] | null>(null)
  const market = row.card.country
  // 上位とみなす線は、配信の国の基準(ST2。⚙ →「国」→「アラートの基準」で変える。国の全員に効くため、ここでは変えない)
  const topN = criteriaFor(market).rankTopN
  const placed = productIds.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p?.product_code)
  const codes = placed.map((p) => p.product_code as string)
  const codesKey = codes.join('|')

  useEffect(() => {
    let alive = true
    // 商品ごとに読む(表は商品 × 週 × チャネルで大きくなるので、市場で読むと件数の上限に当たる)
    void Promise.all(codesKey.split('|').filter(Boolean).map((c) => ProductRankingsService.getAll({ filter: `product_code eq '${c.replace(/'/g, "''")}'` }))).then((res) => {
      if (alive) setRankings(res.flatMap((r) => r.data ?? []))
    })
    return () => {
      alive = false
    }
  }, [codesKey])

  const sent = sentAtOf(row)
  const week = sent ? weekStartOf(new Date(sent)) : undefined
  const before = week ? [-4, -3, -2, -1].map((n) => addWeeks(week, n)) : []
  const after = week ? [week, addWeeks(week, 1)] : []
  const rankOf = (code: string, ch: RankingChannel, w: string) =>
    rankings?.find((r) => r.product_code === code && r.channel === ch && r.week_start?.slice(0, 10) === w && (!r.market || !market || r.market === market))

  const channelLabel = (ch: RankingChannel) => (ch === 'all' ? t('全社', 'All channels') : ch === 'ec' ? t('EC', 'EC') : t('配信経由', 'Via deliveries'))
  const n = (v?: number) => (v ?? 0).toLocaleString(locale())

  const rankCell = (key: string, r: ProductRanking | undefined) => (
    <td key={key} className={styles.td}>
      {r?.rank ? (
        <Tooltip content={t(`${n(r.units)} 点`, `${n(r.units)} units`)} relationship="description">
          <span className={r.rank <= topN ? styles.inTop : styles.outTop}>{t(`${n(r.rank)} 位`, `#${n(r.rank)}`)}</span>
        </Tooltip>
      ) : (
        <span className={styles.muted}>—</span>
      )}
    </td>
  )

  return (
    <section>
      <div className={styles.head}>
        <h3 className={styles.h3}>{t('商品: 販売チャネルごとの順位(数量)', 'Products: sales rank by channel (units)')}</h3>
        <span className={styles.topN}>
          {t('上位とみなす線', 'Top line')}
          <span title={t('変えるのは ⚙ →「国」→「アラートの基準」', 'Change it in ⚙ → Country → Alert criteria')}>{` Top ${topN}`}</span>
        </span>
      </div>
      <div className={styles.note}>
        {t(
          `国(${market ?? '—'})の中の、売れた数量の順位。配信経由は、メール・アプリのすべての配信を通った売上。「配信前 4 週」は Top ${topN} に入った週の数(印は古い順)。順位にマウスを重ねると、数量が出ます`,
          `Rank by units sold within the market (${market ?? '—'}). "Via deliveries" counts sales through any email or app delivery. "4 wks before" counts weeks in the Top ${topN} (marks are oldest first). Hover a rank to see units.`,
        )}
      </div>
      {placed.length === 0 ? (
        <div className={styles.muted}>{t('載せた商品がありません', 'No products in this delivery')}</div>
      ) : rankings === null ? (
        <div className={styles.muted}>{t('読み込み中…', 'Loading…')}</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th} />
              {RANKING_CHANNELS.map((ch) => (
                <th key={ch} colSpan={3} className={mergeClasses(styles.th, styles.group)}>
                  {channelLabel(ch)}
                </th>
              ))}
            </tr>
            <tr>
              <th className={mergeClasses(styles.th, styles.prod)}>{t('商品(位置)', 'Product (slot)')}</th>
              {RANKING_CHANNELS.map((ch) => [
                <th key={`${ch}b`} className={mergeClasses(styles.th, styles.first)}>{t('配信前 4 週', '4 wks before')}</th>,
                <th key={`${ch}w`} className={styles.th}>{t('配信の週', 'Delivery wk')}</th>,
                <th key={`${ch}n`} className={styles.th}>{t('翌週', 'Next wk')}</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {placed.map((p, i) => {
              const code = p.product_code as string
              return (
                <tr key={p.id}>
                  <td className={mergeClasses(styles.td, styles.prod)} title={`${p.name} (${code})`}>
                    <span className={styles.slot}>{t(`枠 ${i + 1}`, `Slot ${i + 1}`)}</span>
                    {p.name}
                  </td>
                  {RANKING_CHANNELS.map((ch) => {
                    const past = before.map((w) => rankOf(code, ch, w))
                    const known = past.filter((r) => r?.rank)
                    const hits = known.filter((r) => (r?.rank ?? Infinity) <= topN).length
                    return [
                      <td key={`${ch}b`} className={mergeClasses(styles.td, styles.first)}>
                        {known.length === 0 ? (
                          <span className={styles.muted}>—</span>
                        ) : (
                          <Tooltip
                            content={past.map((r, k) => `${before[k].slice(5)}: ${r?.rank ? t(`${n(r.rank)} 位`, `#${n(r.rank)}`) : '—'}`).join(' / ')}
                            relationship="description"
                          >
                            <span>
                              <span className={styles.dots} aria-hidden>
                                {past.map((r, k) => (
                                  <span key={k} className={mergeClasses(styles.dot, !r?.rank ? styles.dotNone : r.rank <= topN && styles.dotOn)} />
                                ))}
                              </span>
                              <span className={hits > 0 ? styles.inTop : styles.outTop}>{`${hits}/${known.length}`}</span>
                            </span>
                          </Tooltip>
                        )}
                      </td>,
                      rankCell(`${ch}w`, rankOf(code, ch, after[0])),
                      rankCell(`${ch}n`, rankOf(code, ch, after[1])),
                    ]
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
