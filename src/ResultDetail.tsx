import { useLayoutEffect, useRef, useState } from 'react'
import { Button, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ChevronLeftRegular } from '@fluentui/react-icons'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import type { Cr854_heroimages } from './generated/models/Cr854_heroimagesModel'
import type { Cr854_weeklyperformances } from './generated/models/Cr854_weeklyperformancesModel'
import { CardPreview } from './CardPreview'
import { FitPreview } from './FitPreview'
import { locale, useT } from './i18n'
import { ResultSummary } from './ResultSummary'
import { isPush, parseLinkResults, parseProductResults, type ResultRow } from './results'

const useStyles = makeStyles({
  root: { padding: '12px 16px' },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px', marginBottom: '12px' },
  title: { margin: 0, fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  body: { display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', columnGap: '16px', alignItems: 'start' },
  // 右の広い欄: プレビュー(リンクごとのクリックを重ねる)と、リンクの表
  wide: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    columnGap: '20px',
    rowGap: '16px',
    padding: '16px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  previewBox: { position: 'relative', flexShrink: 0, boxShadow: tokens.shadow8 },
  // 重ねる枠: クリックの割合が大きいほど濃い
  spot: {
    position: 'absolute',
    boxSizing: 'border-box',
    border: '2px solid rgba(230, 81, 0, 0.9)',
    borderRadius: '4px',
    pointerEvents: 'auto',
    cursor: 'default',
    transitionProperty: 'outline-color',
    transitionDuration: '0.1s',
  },
  spotOn: { outline: `3px solid ${tokens.colorBrandStroke1}`, outlineOffset: '1px' },
  tag: {
    position: 'absolute',
    top: '2px',
    left: '2px',
    padding: '1px 6px',
    borderRadius: '10px',
    backgroundColor: 'rgba(230, 81, 0, 0.95)',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  },
  side: { flexGrow: 1, minWidth: '280px', maxWidth: '520px', display: 'grid', rowGap: '8px' },
  h3: { margin: 0, fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: tokens.fontSizeBase200, fontVariantNumeric: 'tabular-nums', backgroundColor: tokens.colorNeutralBackground1 },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${tokens.colorNeutralStroke1}`, fontWeight: tokens.fontWeightSemibold, whiteSpace: 'nowrap' },
  td: { padding: '5px 8px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  num: { textAlign: 'right', whiteSpace: 'nowrap' },
  rowOn: { backgroundColor: tokens.colorBrandBackground2 },
  bar: { height: '6px', borderRadius: '3px', backgroundColor: 'rgba(230, 81, 0, 0.8)' },
  missing: { color: tokens.colorNeutralForeground3 },
})

/** プレビューの上の、リンクの位置 */
interface Spot {
  key: string
  x: number
  y: number
  w: number
  h: number
  /** ボタンの文字など、プレビューから読んだ名前 */
  text?: string
}

/** 表の行(リンク 1 つ) */
interface LinkRow {
  key: string
  label: string
  clicks: number
  /** プレビューの上に位置がある */
  placed: boolean
}

interface Props {
  row: ResultRow
  productIds: string[]
  products: Cr854_products[]
  heroes: Cr854_heroimages[]
  weekly: Cr854_weeklyperformances[]
  money: (v?: number) => string
  onBack: () => void
  onOpenCard: (id: string) => void
  onSaved: () => Promise<void>
}

/**
 * 配信 1 本の詳しい結果。左に数字のまとめ、右の広い欄に、プレビューの上へ、リンクごとのクリック数を重ねて出す
 * (メイン画像・ボタン・商品。アプリは、通知のタップも)。どこが押されたかを、見た目のまま確かめるため
 */
export function ResultDetail({ row, productIds, products, heroes, weekly, money, onBack, onOpenCard, onSaved }: Props) {
  const styles = useStyles()
  const t = useT()
  const { card, result } = row
  const push = isPush(card)
  const box = useRef<HTMLDivElement>(null)
  const [spots, setSpots] = useState<Spot[]>([])
  const [hover, setHover] = useState<string | null>(null)

  // プレビューの中の、リンクの部品(data-link と、商品の枠の data-item-key)の位置を測る。画像の読み込みで位置が変わるので、測り直す
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const base = el.getBoundingClientRect()
      let button = 0
      const found: Spot[] = []
      el.querySelectorAll<HTMLElement>('[data-link], [data-item-key]').forEach((n) => {
        const r = n.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) return
        const link = n.dataset.link
        const key = link === 'button' ? `button:${button++}` : link ? link : `product:${(n.dataset.itemKey ?? '').replace(/-\d+$/, '')}`
        found.push({ key, x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height, text: link === 'button' ? n.textContent ?? '' : undefined })
      })
      setSpots(found)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // 画像の読み込み(load は泡立たないので、捕まえる側で受ける)
    el.addEventListener('load', measure, true)
    const timer = window.setTimeout(measure, 800)
    return () => {
      ro.disconnect()
      el.removeEventListener('load', measure, true)
      window.clearTimeout(timer)
    }
  }, [card.cr854_deliverycardid])

  // リンクごとのクリック。商品は、商品ごとの結果のクリック。アプリは、通知のタップ(開封の数)
  const links = parseLinkResults(result.cr854_links)
  const productClicks = new Map(parseProductResults(result.cr854_products).map((p) => [p.productId, p.clicks]))
  const placed = new Set(spots.map((s) => s.key))
  const buttonSpots = spots.filter((s) => s.key.startsWith('button:'))
  const productName = (id: string) => products.find((p) => p.cr854_productid === id)?.cr854_name ?? id
  const rows: LinkRow[] = [
    ...(push ? [{ key: 'push', label: t('通知のタップ', 'Notification tap'), clicks: result.cr854_opens ?? 0, placed: placed.has('push') }] : []),
    ...(links.hero !== undefined ? [{ key: 'hero', label: t('メイン画像', 'Hero image'), clicks: links.hero, placed: placed.has('hero') }] : []),
    // ボタンは、プレビューにある数だけ出す(テンプレートのボタンの数を超える分は「その他」に入れる)
    ...buttonSpots.map((s, i) => ({ key: s.key, label: t(`ボタン ${i + 1}「${s.text}」`, `Button ${i + 1} "${s.text}"`), clicks: links.buttons?.[i] ?? 0, placed: true })),
    // 商品は、プレビューに載っている商品と、結果のある商品の両方
    ...[...new Set([...productIds, ...productClicks.keys()])].map((id) => ({ key: `product:${id}`, label: productName(id), clicks: productClicks.get(id) ?? 0, placed: placed.has(`product:${id}`) })),
  ]
  const extraButtons = (links.buttons ?? []).slice(buttonSpots.length).reduce((s, v) => s + v, 0)
  const other = (links.other ?? 0) + extraButtons
  if (other > 0) rows.push({ key: 'other', label: t('その他(フッターなど)', 'Other (footer, etc.)'), clicks: other, placed: false })
  // 割合は、通知のタップを除いた、メッセージの中のクリックの合計に対して
  const linkTotal = rows.filter((r) => r.key !== 'push').reduce((s, r) => s + r.clicks, 0)
  const share = (r: LinkRow) => (r.key === 'push' ? (result.cr854_recipients ? r.clicks / result.cr854_recipients : 0) : linkTotal ? r.clicks / linkTotal : 0)
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const n = (v: number) => v.toLocaleString(locale())

  const maxH = Math.max(420, window.innerHeight - 170)
  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <Button size="small" appearance="subtle" icon={<ChevronLeftRegular />} onClick={onBack}>
          {t('配信結果', 'Results')}
        </Button>
        <h2 className={styles.title}>{t(`${card.cr854_name} の結果`, `Results: ${card.cr854_name}`)}</h2>
      </div>
      <div className={styles.body}>
        <ResultSummary row={row} weekly={weekly} productName={productName} productCode={(id) => products.find((p) => p.cr854_productid === id)?.cr854_productcode} money={money} onOpenCard={onOpenCard} onSaved={onSaved} />
        <div className={styles.wide}>
          <div ref={box} className={styles.previewBox}>
            <FitPreview maxWidth={push ? 560 : 460} maxHeight={maxH}>
              <CardPreview card={card} productIds={productIds} products={products} heroes={heroes} />
            </FitPreview>
            {spots.map((s, i) => {
              const r = byKey.get(s.key)
              if (!r) return null
              const v = share(r)
              const on = hover === s.key
              return (
                <div
                  key={`${s.key}-${i}`}
                  className={mergeClasses(styles.spot, on && styles.spotOn)}
                  style={{ left: s.x, top: s.y, width: s.w, height: s.h, backgroundColor: `rgba(230, 81, 0, ${Math.min(0.5, 0.08 + v * 1.2)})` }}
                  title={`${r.label}: ${n(r.clicks)}`}
                  onMouseEnter={() => setHover(s.key)}
                  onMouseLeave={() => setHover(null)}
                >
                  <span className={styles.tag}>{`${n(r.clicks)} · ${(v * 100).toFixed(r.key === 'push' ? 1 : 0)}%`}</span>
                </div>
              )
            })}
          </div>
          <div className={styles.side}>
            <h3 className={styles.h3}>{t('リンクごとのクリック', 'Clicks by link')}</h3>
            <div className={styles.note}>
              {t(
                'クリックは延べ回数(1 人が何度も押すと、その分数えます)。割合は、メッセージの中のクリックの合計に対して。通知のタップは、送った数に対する割合です',
                'Clicks are total clicks (repeat clicks count). Shares are of all clicks in the message; notification taps are a share of recipients.',
              )}
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>{t('リンク', 'Link')}</th>
                  <th className={mergeClasses(styles.th, styles.num)}>{t('クリック', 'Clicks')}</th>
                  <th className={mergeClasses(styles.th, styles.num)}>{t('割合', 'Share')}</th>
                  <th className={styles.th} style={{ width: '30%' }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className={mergeClasses(hover === r.key && styles.rowOn)} onMouseEnter={() => setHover(r.key)} onMouseLeave={() => setHover(null)}>
                    <td className={mergeClasses(styles.td, !r.placed && styles.missing)} title={r.placed ? undefined : t('プレビューに位置がありません', 'Not shown in the preview')}>
                      {r.label}
                    </td>
                    <td className={mergeClasses(styles.td, styles.num)}>{n(r.clicks)}</td>
                    <td className={mergeClasses(styles.td, styles.num)}>{`${(share(r) * 100).toFixed(1)}%`}</td>
                    <td className={styles.td}>
                      <div className={styles.bar} style={{ width: `${Math.min(100, share(r) * (r.key === 'push' ? 400 : 200))}%` }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
