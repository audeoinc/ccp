import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Badge, Button, MessageBar, MessageBarBody, Spinner, ToggleButton, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import { ProductCategory, type Product } from './models/products'
import { AdSpendMedia, type AdSpend } from './models/adSpends'
import type { WeeklyPerformance } from './models/weeklyPerformances'
import { AdSpendsService } from './data/adSpends'
import { DeliveryResultsService, type DeliveryResult } from './data/deliveryResults'
import { WeeklyPerformancesService } from './data/weeklyPerformances'
import { DataTable, type DataColumn } from './DataTable'
import { ChannelBadge } from './ChannelBadge'
import { productImage } from './images'
import { locale, optionLabel, priceText, useT, type Market } from './i18n'
import { mergeResultsByCard, parseProductResults } from './results'
import { productMarket } from './market'
import { weeklyLimit } from './weeklyLimit'
import { weekKeyOf } from './weekLock'
import { CHANNEL_PUSH } from './status'
import { productGenderLabel } from './target'
import { ProductDetailButton } from './ProductDetailButton'

// 見せ方「商品」(X49): 商品を軸に、期間の中で、どの配信に何回載せたか・その結果・週ごとの実績・外部広告の出稿を並べる。
// 外部に出稿している商品を、配信でも推すべきかを決める材料にする。SPU(商品)とカテゴリの 2 つの粒度で見られる

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '10px' },
  bar: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  label: { color: tokens.colorNeutralForeground3 },
  thumb: { display: 'block', width: '40px', height: '40px', objectFit: 'contain', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3 },
  name: { display: 'grid', rowGap: '1px', minWidth: 0 },
  nameMain: { fontWeight: tokens.fontWeightSemibold },
  sub: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  flags: { display: 'flex', flexWrap: 'wrap', gap: '4px' },
  flag: { padding: '0 6px', borderRadius: '8px', fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightSemibold, color: '#fff', whiteSpace: 'nowrap' },
  muted: { color: tokens.colorNeutralForeground3 },
  // 選んだ行の詳しい欄(期間の中の掲載と出稿の並び)
  detail: { display: 'grid', rowGap: '8px', padding: '12px 14px', borderRadius: tokens.borderRadiusLarge, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow2 },
  detailHead: { display: 'flex', alignItems: 'center', columnGap: '10px' },
  detailTitle: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400 },
  close: { marginLeft: 'auto' },
  lane: { position: 'relative', height: '26px', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3 },
  laneLabel: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  adBlock: { position: 'absolute', top: '4px', bottom: '4px', borderRadius: '2px', backgroundColor: tokens.colorPaletteMarigoldBorderActive, opacity: 0.55 },
  dot: { position: 'absolute', top: '3px', width: '20px', height: '20px', marginLeft: '-10px', border: 'none', padding: 0, background: 'none', cursor: 'pointer' },
  axis: { display: 'flex', justifyContent: 'space-between', fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, fontVariantNumeric: 'tabular-nums' },
  list: { display: 'grid', rowGap: '4px', fontSize: tokens.fontSizeBase200 },
  listRow: { display: 'flex', alignItems: 'center', columnGap: '8px', border: 'none', background: 'none', padding: '2px 0', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', ':hover': { textDecorationLine: 'underline' } },
})

/** 粒度: SPU(商品)/ カテゴリ */
export type ProductGrain = 'spu' | 'category'

interface Props {
  /** 絞り込み済みの配信(国・チャネル・種類 など) */
  cards: DeliveryCard[]
  cardProducts: Map<string, string[]>
  products: Product[]
  /** 期間(YYYY-MM-DD。両端を含む) */
  from: string
  to: string
  /** 配信を開く(結果があれば詳しい結果、なければ配信カード) */
  onOpenCard: (id: string) => void
  onOpenResult: (id: string) => void
}

interface Placement {
  card: DeliveryCard
  date: string
  /** メールの並びの何番目か(1 から) */
  position: number
}

interface Row {
  key: string
  market: Market
  /** SPU の行のときの商品 */
  product?: Product
  label: string
  sub: string
  /** カテゴリの行のときの、商品の数 */
  productCount: number
  placements: Placement[]
  email: number
  app: number
  future: number
  lastDate?: string
  clicks: number
  recipients: number
  units: number
  /** 配信経由の売上(配信の結果の、商品ごとの売上) */
  revenue: number
  /** 期間の売上全体・売れた数(週ごとの実績) */
  weekRevenue: number
  weekUnits: number
  adDays: number
  adSpend: number
  adClicks: number
  adRevenue: number
  adMedia: Set<string>
  adDates: Set<string>
  overLimit: boolean
}

const dayKey = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 見せ方「商品」(X49) */
export function ProductsView({ cards, cardProducts, products, from, to, onOpenCard, onOpenResult }: Props) {
  const s = useStyles()
  const t = useT()
  const [grain, setGrain] = useState<ProductGrain>('spu')
  const [selected, setSelected] = useState<string | null>(null)
  const [results, setResults] = useState<DeliveryResult[] | null>(null)
  const [weekly, setWeekly] = useState<WeeklyPerformance[]>([])
  const [ads, setAds] = useState<AdSpend[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    DeliveryResultsService.getAll()
      .then((r) => (r.success ? setResults(r.data ?? []) : setError(r.error?.message ?? 'results')))
      .catch((e: unknown) => setError(String(e)))
    WeeklyPerformancesService.getAll()
      .then((r) => r.success && setWeekly(r.data ?? []))
      .catch(() => undefined)
    AdSpendsService.getAll()
      .then((r) => r.success && setAds(r.data ?? []))
      .catch(() => undefined)
  }, [])

  const rows = useMemo(() => {
    if (!results) return []
    const inRange = (ymd: string) => ymd >= from && ymd <= to
    const today = dayKey(new Date().toISOString())
    const byId = new Map(products.map((p) => [p.id, p]))
    const byCode = new Map(products.map((p) => [`${productMarket(p)}:${p.product_code}`, p]))
    const byCodeOnly = new Map(products.map((p) => [String(p.product_code), p]))
    // AB テストの配信は、案ごとの行を合計した 1 行で見る(X55)
    const resultOf = new Map(mergeResultsByCard(results).map((r) => [r.delivery_card_id!, r]))
    const markets = new Set(cards.map((c) => (c.country === 'US' ? 'US' : 'JP')))
    // 商品ごとに集める
    const per = new Map<string, Row>()
    const rowOf = (p: Product): Row => {
      const key = p.id
      let r = per.get(key)
      if (!r) {
        r = {
          key, market: productMarket(p), product: p, label: p.name ?? '', sub: [p.product_code, productGenderLabel(p.gender)].filter(Boolean).join(' ・ '), productCount: 1,
          placements: [], email: 0, app: 0, future: 0, clicks: 0, recipients: 0, units: 0, revenue: 0, weekRevenue: 0, weekUnits: 0,
          adDays: 0, adSpend: 0, adClicks: 0, adRevenue: 0, adMedia: new Set(), adDates: new Set(), overLimit: false,
        }
        per.set(key, r)
      }
      return r
    }
    const weekUse = new Map<string, number>()
    for (const c of cards) {
      const ymd = dayKey(c.scheduled_at)
      if (!ymd || !inRange(ymd)) continue
      const ids = [...new Set(cardProducts.get(c.id) ?? [])]
      const res = resultOf.get(c.id)
      const pr = new Map(parseProductResults(res?.products).map((x) => [x.productId, x]))
      ids.forEach((pid, i) => {
        const p = byId.get(pid)
        if (!p) return
        const r = rowOf(p)
        r.placements.push({ card: c, date: ymd, position: (cardProducts.get(c.id) ?? []).indexOf(pid) + 1 || i + 1 })
        if (c.channel === CHANNEL_PUSH) r.app++
        else r.email++
        if (ymd > today) r.future++
        if (!r.lastDate || ymd > r.lastDate) r.lastDate = ymd
        const x = pr.get(pid)
        if (x) {
          r.clicks += x.clicks
          r.units += x.units
          r.revenue += x.revenue
          r.recipients += Number(res?.recipients ?? 0)
        }
        const wk = `${weekKeyOf(new Date(c.scheduled_at!))}:${pid}`
        weekUse.set(wk, (weekUse.get(wk) ?? 0) + 1)
        if ((weekUse.get(wk) ?? 0) > weeklyLimit()) r.overLimit = true
      })
    }
    // 外部広告(期間の中・表示中の国の商品)。配信に載っていない商品も、出稿があれば行を作る
    for (const a of ads) {
      if (!a.date || !inRange(a.date.slice(0, 10)) || !markets.has(a.market === 'US' ? 'US' : 'JP')) continue
      const p = byCode.get(`${a.market}:${a.product_code}`)
      if (!p) continue
      const r = rowOf(p)
      r.adDates.add(a.date.slice(0, 10))
      r.adSpend += Number(a.spend ?? 0)
      r.adClicks += Number(a.clicks ?? 0)
      r.adRevenue += Number(a.revenue ?? 0)
      if (a.media) r.adMedia.add(a.media)
    }
    // 週ごとの実績(期間にかかる週の、売れた数・売上の全体)
    const fromWeek = weekKeyOf(new Date(`${from}T00:00:00`))
    for (const w of weekly) {
      const ws = w.week_start?.slice(0, 10)
      if (!ws || ws < fromWeek || ws > to) continue
      // 市場のない行(見本のデータ)は、商品コードだけで探す(US の商品コードも JP と取り違えないように)
      const p = w.market ? byCode.get(`${w.market === 'US' ? 'US' : 'JP'}:${w.product_code}`) : byCodeOnly.get(String(w.product_code))
      const r = p && per.get(p.id)
      if (!r) continue
      r.weekUnits += Number(w.units ?? 0)
      r.weekRevenue += Number(w.revenue ?? 0)
    }
    for (const r of per.values()) r.adDays = r.adDates.size
    const spu = [...per.values()]
    if (grain === 'spu') return spu
    // カテゴリ: 階層の上 2 段(なければ、カテゴリ)で、国ごとにまとめる
    const cat = new Map<string, Row>()
    for (const r of spu) {
      const p = r.product!
      const path = (p.category_path ?? '').split('>').map((x) => x.trim()).filter(Boolean)
      // 階層がなければ、カテゴリの表示名(トップス など)
      const name = path.length > 0 ? path.slice(0, 2).join(' > ') : p.category ? optionLabel(ProductCategory[p.category] ?? p.category) : '—'
      const key = `${r.market}:${name}`
      const g = cat.get(key) ?? {
        ...r, key, product: undefined, label: name, sub: r.market, productCount: 0, placements: [], email: 0, app: 0, future: 0, lastDate: undefined,
        clicks: 0, recipients: 0, units: 0, revenue: 0, weekRevenue: 0, weekUnits: 0, adDays: 0, adSpend: 0, adClicks: 0, adRevenue: 0, adMedia: new Set<string>(), adDates: new Set<string>(), overLimit: false,
      }
      g.productCount++
      g.placements.push(...r.placements)
      g.email += r.email
      g.app += r.app
      g.future += r.future
      if (r.lastDate && (!g.lastDate || r.lastDate > g.lastDate)) g.lastDate = r.lastDate
      g.clicks += r.clicks
      g.recipients += r.recipients
      g.units += r.units
      g.revenue += r.revenue
      g.weekRevenue += r.weekRevenue
      g.weekUnits += r.weekUnits
      g.adSpend += r.adSpend
      g.adClicks += r.adClicks
      g.adRevenue += r.adRevenue
      r.adMedia.forEach((m) => g.adMedia.add(m))
      r.adDates.forEach((d) => g.adDates.add(d))
      g.adDays = g.adDates.size
      g.overLimit = g.overLimit || r.overLimit
      cat.set(key, g)
    }
    return [...cat.values()]
  }, [results, ads, weekly, cards, cardProducts, products, from, to, grain])

  const money = (v: number, m: Market) => (v ? priceText(Math.round(v), m) : '—')
  const ctr = (r: Row) => (r.recipients ? r.clicks / r.recipients : undefined)
  const roas = (r: Row) => (r.adSpend ? r.adRevenue / r.adSpend : undefined)
  // 判断の材料になる組み合わせを、印で目立たせる
  const flagsOf = (r: Row): { text: string; color: string; tip: string }[] => {
    const out: { text: string; color: string; tip: string }[] = []
    if (r.overLimit) out.push({ text: t('週の上限超え', 'Over weekly limit'), color: tokens.colorPaletteBrownBorderActive, tip: t(`同じ週に ${weeklyLimit()} 回を超えて載せている`, `Featured more than ${weeklyLimit()} times in a week`) })
    if (r.adDays >= 7 && r.placements.length >= 3) out.push({ text: t('外部広告と重複', 'Also in ads'), color: tokens.colorPaletteBerryBorderActive, tip: t('外部広告で 7 日以上出稿している商品を、配信でも 3 回以上載せている', 'Heavily featured while also running in paid ads') })
    const ro = roas(r)
    if (ro !== undefined && ro >= 3 && r.placements.length === 0) out.push({ text: t('外部で好調・未掲載', 'Strong in ads, not featured'), color: tokens.colorPaletteGreenBorderActive, tip: t(`外部広告の費用対効果が ${ro.toFixed(1)} 倍なのに、配信に載せていない`, `Ad ROAS ${ro.toFixed(1)}x but not featured in deliveries`) })
    const c = ctr(r)
    if (c !== undefined && r.placements.length >= 2 && c < 0.01) out.push({ text: t('CTR が低い', 'Low CTR'), color: tokens.colorPaletteDarkOrangeBorderActive, tip: t('何度も載せているのに、クリック率が 1% 未満', 'Featured often but CTR below 1%') })
    return out
  }
  const pct = (v?: number) => (v === undefined ? '—' : `${(v * 100).toFixed(1)}%`)
  const dateText = (ymd?: string) => (ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString(locale(), { month: 'numeric', day: 'numeric' }) : '—')

  const columns: DataColumn<Row>[] = [
    {
      key: 'name',
      label: grain === 'spu' ? t('商品', 'Product') : t('カテゴリ', 'Category'),
      wide: true,
      sort: (r) => r.label,
      cell: (r) => (
        <span style={{ display: 'flex', alignItems: 'center', columnGap: 8 }}>
          {r.product && (productImage(r.product) ? <img className={s.thumb} src={productImage(r.product)} alt="" draggable={false} /> : <span className={s.thumb} />)}
          <span className={s.name}>
            <span className={s.nameMain}>{r.label}</span>
            <span className={s.sub}>{r.product ? r.sub : t(`${r.sub} ・ ${r.productCount} 商品`, `${r.sub} · ${r.productCount} products`)}</span>
            {flagsOf(r).length > 0 && (
              <span className={s.flags}>
                {flagsOf(r).map((f) => (
                  <Tooltip key={f.text} content={f.tip} relationship="description">
                    <span className={s.flag} style={{ backgroundColor: f.color }}>{f.text}</span>
                  </Tooltip>
                ))}
              </span>
            )}
          </span>
        </span>
      ),
    },
    { key: 'count', label: t('掲載', 'Featured'), numeric: true, sort: (r) => r.placements.length, cell: (r) => r.placements.length || <span className={s.muted}>0</span> },
    { key: 'channel', label: t('メール / アプリ', 'Email / App'), numeric: true, sort: (r) => r.email, cell: (r) => `${r.email} / ${r.app}` },
    { key: 'future', label: t('うち予定', 'Upcoming'), numeric: true, sort: (r) => r.future, cell: (r) => r.future || '—' },
    { key: 'last', label: t('最後の掲載', 'Last featured'), numeric: true, sort: (r) => r.lastDate ?? '', cell: (r) => dateText(r.lastDate) },
    { key: 'clicks', label: t('クリック', 'Clicks'), numeric: true, sort: (r) => r.clicks, cell: (r) => (r.clicks ? r.clicks.toLocaleString(locale()) : '—') },
    { key: 'ctr', label: 'CTR', numeric: true, sort: (r) => ctr(r) ?? -1, cell: (r) => pct(ctr(r)) },
    { key: 'revenue', label: t('配信経由の売上', 'Revenue from deliveries'), numeric: true, sort: (r) => r.revenue, cell: (r) => money(r.revenue, r.market) },
    { key: 'weekRevenue', label: t('期間の売上(全体)', 'Total revenue'), numeric: true, sort: (r) => r.weekRevenue, cell: (r) => money(r.weekRevenue, r.market) },
    { key: 'adDays', label: t('外部広告 日数', 'Ad days'), numeric: true, sort: (r) => r.adDays, cell: (r) => r.adDays || '—' },
    { key: 'adSpend', label: t('外部広告 費用', 'Ad spend'), numeric: true, sort: (r) => r.adSpend, cell: (r) => money(r.adSpend, r.market) },
    { key: 'roas', label: t('広告の費用対効果', 'Ad ROAS'), numeric: true, sort: (r) => roas(r) ?? -1, cell: (r) => (roas(r) === undefined ? '—' : `${roas(r)!.toFixed(1)}x`) },
  ]

  const current = rows.find((r) => r.key === selected)
  const span = Math.max(1, (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000 + 1)
  const xOf = (ymd: string) => ((new Date(`${ymd}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000 + 0.5) / span * 100
  const detail: ReactNode = current && (
    <div className={s.detail}>
      <div className={s.detailHead}>
        {current.product && productImage(current.product) && <img className={s.thumb} src={productImage(current.product)} alt="" draggable={false} />}
        <span className={s.detailTitle}>{current.label}</span>
        {/* SKU ごとの在庫などを、その場で開く(X63。カテゴリの行には出さない)。商品の名前のすぐ右に置く(利用者 2026-10-21) */}
        {current.product && <ProductDetailButton product={current.product} />}
        <span className={s.sub}>{t(`掲載 ${current.placements.length} 回 ・ 外部広告 ${current.adDays} 日${current.adMedia.size ? `(${[...current.adMedia].map((m) => AdSpendMedia[m as keyof typeof AdSpendMedia] ?? m).join('・')})` : ''}`, `Featured ${current.placements.length}× · Ads ${current.adDays} days`)}</span>
        <Button className={s.close} appearance="subtle" size="small" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={() => setSelected(null)} />
      </div>
      {/* 期間の中の並び: 下の帯 = 外部広告を出稿した日、点 = 配信に載せた日(押すと開く) */}
      <span className={s.laneLabel}>{t('期間の中の並び(点 = 配信、帯 = 外部広告の出稿)', 'Timeline (dots = deliveries, bars = paid ads)')}</span>
      <div className={s.lane}>
        {[...current.adDates].map((d) => (
          <span key={d} className={s.adBlock} style={{ left: `${xOf(d) - 50 / span}%`, width: `${100 / span}%` }} />
        ))}
        {current.placements.map((p) => (
          <Tooltip key={`${p.card.id}:${p.position}`} content={`${dateText(p.date)} ${p.card.name}(${p.position}${t(' 番目', 'th')})`} relationship="label">
            <button type="button" className={s.dot} style={{ left: `${xOf(p.date)}%` }} onClick={() => onOpenCard(p.card.id)}>
              <ChannelBadge channel={p.card.channel} size="icon" />
            </button>
          </Tooltip>
        ))}
      </div>
      <div className={s.axis}>
        <span>{dateText(from)}</span>
        <span>{dateText(to)}</span>
      </div>
      <div className={s.list}>
        {[...current.placements].sort((a, b) => a.date.localeCompare(b.date)).map((p) => (
          <button key={`${p.card.id}:${p.position}`} type="button" className={s.listRow} onClick={() => (results?.some((r) => r.delivery_card_id === p.card.id) ? onOpenResult(p.card.id) : onOpenCard(p.card.id))}>
            <ChannelBadge channel={p.card.channel} size="icon" />
            <span>{dateText(p.date)}</span>
            <span>{p.card.name}</span>
            <span className={s.sub}>{t(`${p.position} 番目`, `#${p.position}`)}</span>
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className={s.root}>
      <div className={s.bar}>
        <span className={s.label}>{t('粒度', 'Grain')}</span>
        {(
          [
            ['spu', t('商品(SPU)', 'Product (SPU)')],
            ['category', t('カテゴリ', 'Category')],
          ] as const
        ).map(([g, name]) => (
          <ToggleButton key={g} size="small" checked={grain === g} appearance={grain === g ? 'primary' : 'subtle'} onClick={() => setGrain(g)}>
            {name}
          </ToggleButton>
        ))}
        <span className={s.label}>{t(`${rows.length} 件 ・ 期間に載せた商品と、外部広告を出稿した商品`, `${rows.length} rows · featured or advertised in the period`)}</span>
        {ads.length === 0 && <Badge appearance="tint" color="warning">{t('外部広告のデータがありません(⚙ の「外部広告の見本を作る」)', 'No ad data yet (⚙ > Create sample ad data)')}</Badge>}
      </div>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {detail}
      {results === null ? (
        <Spinner size="small" />
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.key}
          ariaLabel={t('商品ごとの掲載と結果', 'Products: featuring and results')}
          empty={t('この期間に載せた商品・出稿した商品はありません', 'No products featured or advertised in this period')}
          onRowClick={(r) => setSelected(r.key === selected ? null : r.key)}
          selectedKey={selected ?? undefined}
          defaultSort={{ key: 'count', dir: 'descending' }}
        />
      )}
    </div>
  )
}

