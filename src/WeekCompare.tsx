import { useMemo, useState } from 'react'
import { Button, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ChevronLeftRegular, ChevronRightRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { CardPreview } from './CardPreview'
import { FitPreview } from './FitPreview'
import { ChannelBadge } from './ChannelBadge'
import { ImageThumb } from './ImageThumb'
import { heroImage, productImage } from './images'
import { locale, useT } from './i18n'
import { CANCELLED_STYLE, isCancelled } from './cancel'
import { THEME_TYPES, themeTypeLabel, themeTypeOf } from './themeTypes'
import { ymd } from './dates'

/**
 * 週の比較(C1。USER_STORIES 14-作1・14-作2)。週の表示の見方「前週と比べる」。
 * 上の段に当週、下の段に比べる週(既定は前週。‹ › でずらせる)を、日〜土の 7 列で上下にそろえ、配信を縮小のプレビューで並べる。
 * 下の「重なり」の欄に、両方の週に出た商品・メイン画像と、テーマの種類ごとの数を出す。欄の商品・画像に重ねると、使っている配信が上下で光る。
 * 配信は App が読んだもの(国・チャネルの絞り込み済み)を受け取り、週で分けるだけ(ここでは読まない)
 */

interface Props {
  /** 当週の初め(日曜日) */
  start: Date
  /** 絞り込み済みの配信(すべての週) */
  cards: DeliveryCard[]
  /** 配信カードごとの掲載商品(メールの並び順の商品 ID) */
  cardProducts: Map<string, string[]>
  products: Product[]
  heroes: HeroImage[]
  onSelect: (id: string) => void
}

// 縮小のプレビューの幅と、1 つの高さの上限(長いメールは、その中で下へ動かして見る)
const THUMB_W = 150
const THUMB_MAX_H = 240

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '12px', minWidth: 0 },
  week: { display: 'grid', rowGap: '6px', minWidth: 0 },
  weekHead: { display: 'flex', alignItems: 'center', columnGap: '8px' },
  weekLabel: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  days: { display: 'grid', gridTemplateColumns: `repeat(7, minmax(${THUMB_W + 12}px, 1fr))`, columnGap: '6px', overflowX: 'auto', paddingBottom: '4px' },
  day: { display: 'grid', alignContent: 'start', rowGap: '6px', minWidth: 0, padding: '6px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
  dayHead: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  card: {
    display: 'grid',
    rowGap: '4px',
    padding: '4px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    minWidth: 0,
    ':hover': { border: `1px solid ${tokens.colorNeutralStroke1Hover}` },
  },
  cardLit: { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: '1px' },
  cardDim: { opacity: 0.45 },
  name: { display: 'flex', alignItems: 'center', columnGap: '2px', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
  theme: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
  thumb: { maxHeight: `${THUMB_MAX_H}px`, overflowY: 'auto', overflowX: 'hidden', borderRadius: tokens.borderRadiusSmall },
  overlap: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', paddingTop: '8px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  box: { display: 'grid', alignContent: 'start', rowGap: '4px', minWidth: 0 },
  boxHead: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  row: { display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr) auto', columnGap: '8px', alignItems: 'center', padding: '2px 4px', borderRadius: tokens.borderRadiusSmall, cursor: 'default', ':hover': { backgroundColor: tokens.colorNeutralBackground2 } },
  rowLit: { backgroundColor: tokens.colorBrandBackground2 },
  rowName: { fontSize: tokens.fontSizeBase200, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
  nums: { fontSize: tokens.fontSizeBase200, fontVariantNumeric: 'tabular-nums', color: tokens.colorNeutralForeground2, whiteSpace: 'nowrap' },
  table: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', columnGap: '12px', rowGap: '2px', fontSize: tokens.fontSizeBase200, fontVariantNumeric: 'tabular-nums' },
  th: { color: tokens.colorNeutralForeground3 },
})

/** 光らせるもの(重なりの欄で、マウスを重ねた商品・メイン画像) */
type Lit = { kind: 'product' | 'hero'; id: string } | null

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

export function WeekCompare({ start, cards, cardProducts, products, heroes, onSelect }: Props) {
  const t = useT()
  const s = useStyles()
  // 比べる週が、当週の何週前か(既定は前週)
  const [back, setBack] = useState(1)
  const [lit, setLit] = useState<Lit>(null)
  const other = addDays(start, -7 * back)
  const otherLabel = back === 1 ? t('前週', 'Last week') : t(`${back} 週前`, `${back} weeks ago`)
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const heroById = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes])

  const weekOf = (from: Date) => {
    const end = addDays(from, 7)
    return cards.filter((c) => {
      if (!c.scheduled_at) return false
      const d = new Date(c.scheduled_at)
      return d >= from && d < end
    })
  }
  const now = weekOf(start)
  const then = weekOf(other)

  // 数えるのは、取りやめていない配信だけ(週の上限の数え方と同じ)
  const count = (list: DeliveryCard[], key: (c: DeliveryCard) => string[]) => {
    const m = new Map<string, number>()
    for (const c of list) if (!isCancelled(c)) for (const k of key(c)) m.set(k, (m.get(k) ?? 0) + 1)
    return m
  }
  const productsOf = (c: DeliveryCard) => cardProducts.get(c.id) ?? []
  const heroOf = (c: DeliveryCard) => (c.hero_image_id ? [c.hero_image_id] : [])
  const pNow = count(now, productsOf)
  const pThen = count(then, productsOf)
  const hNow = count(now, heroOf)
  const hThen = count(then, heroOf)
  const both = (a: Map<string, number>, b: Map<string, number>) => [...a.keys()].filter((k) => b.has(k)).sort((x, y) => (a.get(y)! + b.get(y)!) - (a.get(x)! + b.get(x)!))
  const sharedProducts = both(pNow, pThen)
  const sharedHeroes = both(hNow, hThen)
  const typeOf = (c: DeliveryCard) => [themeTypeOf(c).type as string]
  const tNow = count(now, typeOf)
  const tThen = count(then, typeOf)
  const types = THEME_TYPES.filter((v) => tNow.has(v) || tThen.has(v))

  const uses = (c: DeliveryCard) => !!lit && (lit.kind === 'product' ? productsOf(c).includes(lit.id) : c.hero_image_id === lit.id)
  const range = (from: Date) => {
    const f = (d: Date) => d.toLocaleDateString(locale(), { month: 'numeric', day: 'numeric' })
    return `${f(from)}〜${f(addDays(from, 6))}`
  }

  const weekRow = (from: Date, list: DeliveryCard[], label: string, nav?: boolean) => (
    <section className={s.week} aria-label={label}>
      <div className={s.weekHead}>
        {nav && <Button size="small" appearance="subtle" icon={<ChevronLeftRegular />} onClick={() => setBack((b) => b + 1)} aria-label={t('もう 1 週前と比べる', 'Compare with one week earlier')} />}
        <span className={s.weekLabel}>{label}</span>
        <span className={s.caption}>{range(from)}</span>
        {nav && <Button size="small" appearance="subtle" icon={<ChevronRightRegular />} disabled={back <= 1} onClick={() => setBack((b) => Math.max(1, b - 1))} aria-label={t('1 週あとと比べる', 'Compare with one week later')} />}
        <span className={s.caption}>{t(`${list.length} 件`, `${list.length} deliveries`)}</span>
      </div>
      <div className={s.days}>
        {Array.from({ length: 7 }, (_, i) => {
          const day = addDays(from, i)
          const key = ymd(day)
          const ofDay = list.filter((c) => c.scheduled_at && ymd(new Date(c.scheduled_at)) === key)
          return (
            <div key={key} className={s.day}>
              <span className={s.dayHead}>{day.toLocaleDateString(locale(), { month: 'numeric', day: 'numeric', weekday: 'short' })}</span>
              {ofDay.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={mergeClasses(s.card, uses(c) && s.cardLit, !!lit && !uses(c) && s.cardDim)}
                  style={isCancelled(c) ? CANCELLED_STYLE : undefined}
                  onClick={() => onSelect(c.id)}
                  title={c.name}
                  data-card-id={c.id}
                >
                  <span className={s.name}>
                    <ChannelBadge channel={c.channel} size="icon" />
                    {c.name}
                  </span>
                  <span className={s.theme}>{[themeTypeLabel(themeTypeOf(c).type), c.theme].filter(Boolean).join(' ・ ')}</span>
                  <div className={s.thumb}>
                    <FitPreview maxWidth={THUMB_W} maxHeight={100000}>
                      <CardPreview card={c} productIds={productsOf(c)} products={products} heroes={heroes} />
                    </FitPreview>
                  </div>
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </section>
  )

  const shared = (kind: 'product' | 'hero', ids: string[], a: Map<string, number>, b: Map<string, number>) =>
    ids.map((id) => {
      const p = kind === 'product' ? productById.get(id) : undefined
      const h = kind === 'hero' ? heroById.get(id) : undefined
      const name = p?.name ?? h?.name ?? id
      return (
        <div key={id} className={mergeClasses(s.row, lit?.kind === kind && lit.id === id && s.rowLit)} onMouseEnter={() => setLit({ kind, id })} onMouseLeave={() => setLit(null)}>
          <ImageThumb src={p ? productImage(p) : heroImage(h)} alt={name} width={32} height={kind === 'product' ? 40 : 24} />
          <span className={s.rowName} title={name}>{name}</span>
          <span className={s.nums}>{t(`当週 ${a.get(id)} ・ ${otherLabel} ${b.get(id)}`, `This week ${a.get(id)} · ${otherLabel} ${b.get(id)}`)}</span>
        </div>
      )
    })

  return (
    <div className={s.root}>
      {weekRow(start, now, t('当週', 'This week'))}
      {weekRow(other, then, otherLabel, true)}
      <div className={s.overlap}>
        <div className={s.box}>
          <Text className={s.boxHead}>{t(`両方の週に出た商品(${sharedProducts.length})`, `Products in both weeks (${sharedProducts.length})`)}</Text>
          {sharedProducts.length ? shared('product', sharedProducts, pNow, pThen) : <span className={s.caption}>{t('ありません', 'None')}</span>}
        </div>
        <div className={s.box}>
          <Text className={s.boxHead}>{t(`両方の週で使ったメイン画像(${sharedHeroes.length})`, `Main images in both weeks (${sharedHeroes.length})`)}</Text>
          {sharedHeroes.length ? shared('hero', sharedHeroes, hNow, hThen) : <span className={s.caption}>{t('ありません', 'None')}</span>}
        </div>
        <div className={s.box}>
          <Text className={s.boxHead}>{t('テーマの種類ごとの配信の数', 'Deliveries by theme type')}</Text>
          {types.length ? (
            <div className={s.table}>
              <span className={s.th}>{t('種類', 'Type')}</span>
              <span className={s.th}>{t('当週', 'This week')}</span>
              <span className={s.th}>{otherLabel}</span>
              {types.map((v) => (
                <span key={v} style={{ display: 'contents' }}>
                  <span>{themeTypeLabel(v)}</span>
                  <span>{tNow.get(v) ?? 0}</span>
                  <span>{tThen.get(v) ?? 0}</span>
                </span>
              ))}
            </div>
          ) : (
            <span className={s.caption}>{t('配信がありません', 'No deliveries')}</span>
          )}
        </div>
      </div>
    </div>
  )
}
