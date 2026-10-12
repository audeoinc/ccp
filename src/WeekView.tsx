import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AddRegular, WarningFilled } from '@fluentui/react-icons'
import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import type { Cr854_heroimages } from './generated/models/Cr854_heroimagesModel'
import { heroImage, productImage } from './images'
import { locale, optionLabel, useT } from './i18n'
import { channelOptions, statusColor, statusOptions } from './status'

interface Props {
  /** 週の初め(日曜日) */
  start: Date
  cards: Cr854_deliverycards[]
  /** 配信カードごとの掲載商品(メールの並び順の商品 ID) */
  cardProducts: Map<string, string[]>
  products: Cr854_products[]
  heroes: Cr854_heroimages[]
  dueSoon?: Set<string>
  onSelect: (id: string) => void
  /** その日付で新規作成する(値は YYYY-MM-DD) */
  onCreate: (day: string) => void
}

const pad = (n: number) => String(n).padStart(2, '0')
const PUSH = 588230001 // チャネル: プッシュ
// 1 日の並び: メールを上、プッシュを下にそろえる(週を横に見比べやすく)。同じチャネルの中は時刻順
const order = (a: Cr854_deliverycards, b: Cr854_deliverycards) =>
  Number(a.cr854_channel === PUSH) - Number(b.cr854_channel === PUSH) || (a.cr854_scheduledat ?? '').localeCompare(b.cr854_scheduledat ?? '')
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const label = (options: { value: number; label: string }[], v?: number) => optionLabel(options.find((o) => o.value === v)?.label)

const useStyles = makeStyles({
  root: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow2,
    overflow: 'hidden',
  },
  col: { display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: `1px solid ${tokens.colorNeutralStroke2}`, ':last-child': { borderRight: 'none' } },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 8px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
  },
  today: { color: tokens.colorBrandForeground1 },
  add: {
    width: '22px',
    height: '22px',
    display: 'grid',
    placeItems: 'center',
    border: 'none',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: 'transparent',
    color: tokens.colorBrandForeground1,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorBrandBackground2 },
  },
  // 1 日 2 本(メール 1 + プッシュ 1)が、スクロールなしで収まる高さにする。3 本以上は、その日の列だけスクロールする
  body: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: '8px',
    padding: '8px',
    height: 'max(480px, calc(100vh - 250px))',
    boxSizing: 'border-box',
    overflowY: 'auto',
  },
  card: {
    flexShrink: 0,
    display: 'grid',
    rowGap: '4px',
    textAlign: 'left',
    padding: '6px 8px 8px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    fontFamily: 'inherit',
    cursor: 'pointer',
    minWidth: 0,
    ':hover': { boxShadow: tokens.shadow4 },
  },
  meta: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  name: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  warn: { color: tokens.colorPaletteDarkOrangeForeground1, verticalAlign: 'text-bottom', marginRight: '2px' },
  // 縮小プレビュー: メイン画像と、商品(最大 4 点)。画像は切らずに全体を見せる
  hero: { width: '100%', aspectRatio: '16 / 9', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3, overflow: 'hidden' },
  img: { display: 'block', width: '100%', height: '100%', objectFit: 'contain' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', columnGap: '3px' },
  thumb: { aspectRatio: '3 / 4', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3, overflow: 'hidden' },
  more: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  // プッシュは、通知の形の小さなプレビュー(タイトルと本文)
  push: {
    display: 'grid',
    rowGap: '2px',
    padding: '6px 8px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    color: tokens.colorNeutralForeground2,
    minWidth: 0,
  },
  pushTitle: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  pushBody: { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  empty: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, fontStyle: 'italic' },
})

/** 1 週間の配信を、縮小プレビューつきで横に並べる(週の計画を、まとめて見比べるため) */
export function WeekView({ start, cards, cardProducts, products, heroes, dueSoon, onSelect, onCreate }: Props) {
  const styles = useStyles()
  const t = useT()
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  const today = dayKey(new Date())
  const byDay = new Map<string, Cr854_deliverycards[]>()
  for (const c of cards) {
    if (!c.cr854_scheduledat) continue
    const k = dayKey(new Date(c.cr854_scheduledat))
    byDay.set(k, [...(byDay.get(k) ?? []), c])
  }
  for (const list of byDay.values()) list.sort(order)
  const productOf = (id: string) => products.find((p) => p.cr854_productid === id)

  return (
    <div className={styles.root}>
      {days.map((d) => {
        const k = dayKey(d)
        return (
          <div key={k} className={styles.col}>
            <div className={mergeClasses(styles.head, k === today && styles.today)}>
              <span>{d.toLocaleDateString(locale(), { weekday: 'short', month: 'numeric', day: 'numeric' })}</span>
              <button type="button" className={styles.add} onClick={() => onCreate(k)} aria-label={t('この日に新規作成', 'New delivery on this day')} title={t('この日に新規作成', 'New delivery on this day')}>
                <AddRegular />
              </button>
            </div>
            <div className={styles.body}>
              {(byDay.get(k) ?? []).map((c) => {
                const ids = cardProducts.get(c.cr854_deliverycardid) ?? []
                const hero = heroImage(heroes.find((h) => h.cr854_heroimageid === c._cr854_heroimage_value))
                const time = new Date(c.cr854_scheduledat!).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
                return (
                  <button
                    key={c.cr854_deliverycardid}
                    type="button"
                    className={styles.card}
                    style={{ borderLeft: `3px solid ${statusColor(c.cr854_status)}` }}
                    onClick={() => onSelect(c.cr854_deliverycardid)}
                    title={c.cr854_name}
                  >
                    <span className={styles.meta}>
                      {time} · {label(channelOptions, c.cr854_channel)} · {label(statusOptions, c.cr854_status)}
                    </span>
                    <span className={styles.name}>
                      {dueSoon?.has(c.cr854_deliverycardid) && <WarningFilled className={styles.warn} aria-label={t('締め切りが近いのに未着手', 'Due soon — not started')} />}
                      {c.cr854_name}
                    </span>
                    {c.cr854_channel === PUSH ? (
                      c.cr854_headline || c.cr854_copy ? (
                        <div className={styles.push}>
                          <span className={styles.pushTitle}>{c.cr854_headline || c.cr854_name}</span>
                          {c.cr854_copy && <span className={styles.pushBody}>{c.cr854_copy}</span>}
                        </div>
                      ) : (
                        <span className={styles.empty}>{t('まだ中身がありません', 'No content yet')}</span>
                      )
                    ) : hero || ids.length ? (
                      <>
                        <div className={styles.hero}>{hero && <img className={styles.img} src={hero} alt="" draggable={false} />}</div>
                        {ids.length > 0 && (
                          <div className={styles.grid}>
                            {ids.slice(0, 4).map((id) => {
                              const p = productOf(id)
                              const src = productImage(p)
                              return (
                                <div key={id} className={styles.thumb} title={p?.cr854_name}>
                                  {src && <img className={styles.img} src={src} alt={p?.cr854_name ?? ''} draggable={false} />}
                                </div>
                              )
                            })}
                          </div>
                        )}
                        {ids.length > 4 && <span className={styles.more}>{t(`ほか ${ids.length - 4} 点`, `+${ids.length - 4} more`)}</span>}
                      </>
                    ) : (
                      <span className={styles.empty}>{t('まだ中身がありません', 'No content yet')}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
