import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { CardPreview } from './CardPreview'
import { FitPreview } from './FitPreview'
import { locale, useT } from './i18n'
import { isPush, parseLinkResults, parseProductResults, type ResultRow } from './results'

const useStyles = makeStyles({
  box: { position: 'relative', flexShrink: 0, alignSelf: 'start', boxShadow: tokens.shadow4, backgroundColor: '#fff' },
  // 重ねる枠: いちばん押されたリンクを最も濃くして、少ないリンクは、ほとんど色を付けない(色と線の濃さは、描くときに決める)
  spot: { position: 'absolute', boxSizing: 'border-box', borderRadius: '4px', cursor: 'default' },
  spotOn: { outline: `3px solid ${tokens.colorBrandStroke1}`, outlineOffset: '1px' },
  // 週の一覧に並べるとき: 押すと、配信の詳しい結果を開く(枠は押せないようにして、下の部品に任せる)
  spotPassive: { pointerEvents: 'none' },
  tag: {
    position: 'absolute',
    top: '2px',
    left: '2px',
    padding: '0 5px',
    borderRadius: '8px',
    border: '1px solid rgba(230, 81, 0, 0.9)',
    backgroundColor: '#fff',
    color: '#b23c00',
    fontSize: '10px',
    lineHeight: '14px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  },
  tagSmall: { fontSize: '9px', lineHeight: '12px', padding: '0 3px' },
  // 上位のリンクのラベルは、塗りつぶして目立たせる
  tagTop: { backgroundColor: 'rgba(230, 81, 0, 0.95)', color: '#fff' },
  // ボタンのような薄い部品は、ラベルを外(上)に出して、文字を隠さない
  tagOut: { top: '-15px', left: '0' },
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

/** リンク 1 つの結果 */
export interface LinkRow {
  key: string
  label: string
  clicks: number
  /** プレビューの上に位置がある */
  placed: boolean
}

/** 表など、プレビューの横に並べるものに渡す */
export interface HeatInfo {
  rows: LinkRow[]
  /** 割合(通知のタップは送った数に対して、ほかはメッセージの中のクリックの合計に対して) */
  share: (r: LinkRow) => number
  hover: string | null
  setHover: (key: string | null) => void
}

interface Props {
  row: ResultRow
  productIds: string[]
  products: Product[]
  heroes: HeroImage[]
  /** プレビューの幅(この幅に合わせて縮める) */
  width: number
  /** プレビューの高さの上限(省略は、上限なし) */
  maxHeight?: number
  /** 週の一覧に並べる小さい表示(ラベルは割合だけ。枠は押せない) */
  compact?: boolean
  /** クリックを重ねる(外すと、元の見た目で確かめられる) */
  overlay?: boolean
  /** プレビューの横に並べるもの(リンクの表など) */
  side?: (info: HeatInfo) => ReactNode
}

/**
 * 配信のプレビューの上に、リンクごとのクリック(メイン画像・ボタン・商品。アプリは通知のタップも)を重ねる。
 * 色の濃さは、いちばん押されたリンクに対する割合。どこに載せた何が押されたかを、見た目のまま確かめるため
 */
export function HeatPreview({ row, productIds, products, heroes, width, maxHeight = 100000, compact = false, overlay = true, side }: Props) {
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
      // フロートが開くときの拡大のアニメーションの途中でも、正しい位置になるよう、見た目の拡大・縮小の分を割り戻す
      // (getBoundingClientRect は拡大・縮小を含み、offsetWidth は含まない)
      const k = el.offsetWidth > 0 ? base.width / el.offsetWidth : 1
      let button = 0
      const found: Spot[] = []
      el.querySelectorAll<HTMLElement>('[data-link], [data-item-key]').forEach((n) => {
        const r = n.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) return
        const link = n.dataset.link
        const key = link === 'button' ? `button:${button++}` : link ? link : `product:${(n.dataset.itemKey ?? '').replace(/-\d+$/, '')}`
        found.push({ key, x: (r.left - base.left) / k, y: (r.top - base.top) / k, w: r.width / k, h: r.height / k, text: link === 'button' ? (n.textContent ?? '') : undefined })
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
  }, [card.id, width])

  // リンクごとのクリック。商品は、商品ごとの結果のクリック。アプリは、通知のタップ(開封の数)
  const links = parseLinkResults(result.links)
  const productClicks = new Map(parseProductResults(result.products).map((p) => [p.productId, p.clicks]))
  const placed = new Set(spots.map((s) => s.key))
  const buttonSpots = spots.filter((s) => s.key.startsWith('button:'))
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id
  const rows: LinkRow[] = [
    ...(push ? [{ key: 'push', label: t('通知のタップ', 'Notification tap'), clicks: result.opens ?? 0, placed: placed.has('push') }] : []),
    ...(links.hero !== undefined ? [{ key: 'hero', label: t('メイン画像', 'Hero image'), clicks: links.hero, placed: placed.has('hero') }] : []),
    // ボタンは、プレビューにある数だけ出す(テンプレートのボタンの数を超える分は「その他」に入れる)
    ...buttonSpots.map((s, i) => ({ key: s.key, label: t(`ボタン ${i + 1}「${s.text}」`, `Button ${i + 1} "${s.text}"`), clicks: links.buttons?.[i] ?? 0, placed: true })),
    // 商品は、プレビューに載っている商品と、結果のある商品の両方
    ...[...new Set([...productIds, ...productClicks.keys()])].map((id) => ({ key: `product:${id}`, label: productName(id), clicks: productClicks.get(id) ?? 0, placed: placed.has(`product:${id}`) })),
  ]
  const other = (links.other ?? 0) + (links.buttons ?? []).slice(buttonSpots.length).reduce((s, v) => s + v, 0)
  if (other > 0) rows.push({ key: 'other', label: t('その他(フッターなど)', 'Other (footer, etc.)'), clicks: other, placed: false })
  const linkTotal = rows.filter((r) => r.key !== 'push').reduce((s, r) => s + r.clicks, 0)
  const share = (r: LinkRow) => (r.key === 'push' ? (result.recipients ? r.clicks / result.recipients : 0) : linkTotal ? r.clicks / linkTotal : 0)
  // 濃さは、メッセージの中で、いちばん押されたリンクに対する割合(通知のタップは、別の物差しなので、中くらいの濃さに固定)
  const maxClicks = Math.max(1, ...rows.filter((r) => r.key !== 'push').map((r) => r.clicks))
  const rel = (r: LinkRow) => (r.key === 'push' ? 0.5 : r.clicks / maxClicks)
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const n = (v: number) => v.toLocaleString(locale())

  return (
    <>
      <div ref={box} className={styles.box}>
        <FitPreview maxWidth={width} maxHeight={maxHeight}>
          <CardPreview card={card} productIds={productIds} products={products} heroes={heroes} />
        </FitPreview>
        {overlay && spots.map((s, i) => {
          const r = byKey.get(s.key)
          if (!r) return null
          const v = share(r)
          const k = rel(r)
          const pctText = `${(v * 100).toFixed(r.key === 'push' ? 1 : 0)}%`
          return (
            <div
              key={`${s.key}-${i}`}
              className={mergeClasses(styles.spot, hover === s.key && styles.spotOn, compact && styles.spotPassive)}
              style={{
                left: s.x,
                top: s.y,
                width: s.w,
                height: s.h,
                backgroundColor: `rgba(230, 81, 0, ${(0.45 * k * k).toFixed(3)})`,
                border: `1.5px solid rgba(230, 81, 0, ${(0.25 + 0.7 * k).toFixed(3)})`,
              }}
              title={compact ? undefined : `${r.label}: ${n(r.clicks)}`}
              onMouseEnter={compact ? undefined : () => setHover(s.key)}
              onMouseLeave={compact ? undefined : () => setHover(null)}
            >
              <span className={mergeClasses(styles.tag, compact && styles.tagSmall, k >= 0.6 && styles.tagTop, s.h < (compact ? 16 : 40) && styles.tagOut)}>
                {compact ? pctText : `${n(r.clicks)} · ${pctText}`}
              </span>
            </div>
          )
        })}
      </div>
      {side?.({ rows, share, hover, setHover })}
    </>
  )
}
