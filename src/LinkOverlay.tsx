import { useCallback, useEffect, useState, type RefObject } from 'react'
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { useT } from './i18n'
import type { LinkSlot } from './links'

// URL の吹き出しの最大の幅(プレビューの枠の右からはみ出さないよう、置く位置もこれで決める)
const TIP_MAX = 320

const useStyles = makeStyles({
  // プレビューの枠(スクロールする箱)の中に、プレビューと重ねて置く。下の操作(ドラッグなど)を邪魔しないよう、押せないようにする
  layer: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, pointerEvents: 'none', zIndex: 2 },
  // リンクの場所の番号(リンク先の設定の欄の番号と同じ)
  badge: {
    position: 'absolute',
    minWidth: '18px',
    height: '18px',
    padding: '0 4px',
    boxSizing: 'border-box',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    fontSize: '11px',
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: '18px',
    textAlign: 'center',
    boxShadow: tokens.shadow4,
  },
  badgeMissing: { backgroundColor: tokens.colorPaletteDarkOrangeBackground3 },
  // 設定の欄で選んでいるリンクの場所
  focus: { position: 'absolute', borderRadius: tokens.borderRadiusMedium, outline: `3px solid ${tokens.colorBrandStroke1}`, outlineOffset: '2px' },
  // マウスを重ねたリンクの、URL の吹き出し
  // 重ねる層は幅が 0 なので、幅を中身に合わせる(合わせないと、1 文字ずつ折り返して縦に伸びる)
  tip: {
    position: 'absolute',
    width: 'max-content',
    maxWidth: `${TIP_MAX}px`,
    padding: '4px 8px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackgroundInverted,
    color: tokens.colorNeutralForegroundInverted,
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    overflowWrap: 'anywhere',
    boxShadow: tokens.shadow8,
    transform: 'translateY(-100%)',
  },
  tipLabel: { fontWeight: tokens.fontWeightSemibold },
  tipMissing: { color: tokens.colorPaletteMarigoldForeground1 },
})

interface Box {
  left: number
  top: number
  width: number
  height: number
}

interface Props {
  /** プレビューの枠(スクロールする箱。position: relative) */
  boxRef: RefObject<HTMLDivElement | null>
  /** リンクの場所(メイン画像・ボタン)。番号は、この並び(リンク先の設定の欄と同じ) */
  slots: LinkSlot[]
  /** その場所の、計測用のパラメーターつきの URL(空なら未設定) */
  urlOf: (slot: LinkSlot) => string
  /** 商品の枠(data-item-key)の、リンク先の URL と商品名。商品の URL は自動で付く */
  productLink: (itemKey: string) => { name: string; url: string } | undefined
  /** リンク先のタブを開いているとき: 番号を出し、商品にも URL の吹き出しを出す */
  linksMode: boolean
  /** リンク先の設定の欄で選んでいる場所(枠で光らせ、見える所までスクロールする) */
  focusKey: string | null
}

/** その場所の、プレビューの中の部品(メイン画像は data-link="hero"、ボタンは data-link-id) */
const elementOf = (root: HTMLElement, slot: LinkSlot) =>
  root.querySelector<HTMLElement>(slot.kind === 'hero' ? '[data-link="hero"]' : `[data-link="button"][data-link-id="${CSS.escape(slot.key)}"]`)

/**
 * リンク先の分かりやすさ(バックログ W12)。プレビューの上に重ねて、
 * - マウスを重ねたリンク(メイン画像・ボタン。リンク先のタブでは商品も)に、設定した URL を吹き出しで出す
 * - リンク先のタブを開いている間は、リンクの場所に、設定の欄と同じ番号を出す
 * - 設定の欄で選んでいる場所を、枠で光らせる
 * プレビューの部品(Preview.tsx)は、ほかの画面とも共通なので、印(data-link・data-link-id)を読むだけにし、ここで重ねて描く
 */
export function LinkOverlay({ boxRef, slots, urlOf, productLink, linksMode, focusKey }: Props) {
  const s = useStyles()
  const t = useT()
  const [boxes, setBoxes] = useState<Map<string, Box>>(new Map())
  const [tip, setTip] = useState<{ box: Box; left: number; label: string; url: string } | null>(null)

  /**
   * 部品の位置を、プレビューの枠の中の位置(スクロールを含む)にする。プレビューの倍率(zoom)は、画面上の位置で測るので、そのまま重なる。
   * ただし、配信カードが開くときの拡大のアニメーション(transform)の途中は、画面上の大きさが縮んでいるので、
   * その分(画面上の幅 / 本来の幅)で割り戻す(割り戻さないと、番号がずれた所に出る)
   */
  const measure = useCallback((el: Element): Box | null => {
    const box = boxRef.current
    if (!box) return null
    const b = box.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return null
    const k = box.offsetWidth > 0 ? b.width / box.offsetWidth : 1
    return { left: (r.left - b.left) / k + box.scrollLeft, top: (r.top - b.top) / k + box.scrollTop, width: r.width / k, height: r.height / k }
  }, [boxRef])

  // 番号と枠の位置。プレビューの中身・倍率・枠の大きさが変わるたびに測り直す(変わったことを知る手段が多いので、間隔を空けて測り直す)
  useEffect(() => {
    if (!linksMode && !focusKey) return
    const update = () => {
      const root = boxRef.current
      if (!root) return
      const next = new Map<string, Box>()
      for (const slot of slots) {
        const el = elementOf(root, slot)
        const m = el && measure(el)
        if (m) next.set(slot.key, m)
      }
      setBoxes(next)
    }
    update()
    const timer = window.setInterval(update, 400)
    return () => {
      window.clearInterval(timer)
      setBoxes(new Map())
    }
  }, [linksMode, focusKey, slots, boxRef, measure])

  // 設定の欄で選んだ場所を、見える所までスクロールする
  useEffect(() => {
    const root = boxRef.current
    const slot = slots.find((x) => x.key === focusKey)
    if (!root || !slot) return
    elementOf(root, slot)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focusKey, slots, boxRef])

  // マウスを重ねたリンクの吹き出し(プレビューの枠で、まとめて受ける)
  useEffect(() => {
    const root = boxRef.current
    if (!root) return
    // 吹き出しの左端。プレビューの枠の右からはみ出さないように寄せる
    const leftOf = (b: Box) => Math.max(0, Math.min(b.left, root.clientWidth + root.scrollLeft - TIP_MAX - 8))
    const onMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const link = target?.closest<HTMLElement>('[data-link="hero"], [data-link="button"]')
      if (link && root.contains(link)) {
        const slot = link.dataset.link === 'hero' ? slots.find((x) => x.kind === 'hero') : slots.find((x) => x.key === link.dataset.linkId)
        const box = measure(link)
        if (slot && box) {
          setTip({ box, left: leftOf(box), label: slot.label, url: urlOf(slot) })
          return
        }
      }
      const item = linksMode ? target?.closest<HTMLElement>('[data-item-key]') : null
      const info = item && root.contains(item) ? productLink(item.dataset.itemKey ?? '') : undefined
      const box = item && measure(item)
      setTip(info && box ? { box, left: leftOf(box), label: info.name, url: info.url } : null)
    }
    const onLeave = () => setTip(null)
    root.addEventListener('mousemove', onMove)
    root.addEventListener('mouseleave', onLeave)
    return () => {
      root.removeEventListener('mousemove', onMove)
      root.removeEventListener('mouseleave', onLeave)
    }
  }, [boxRef, slots, urlOf, productLink, linksMode, measure])

  const focusBox = focusKey ? boxes.get(focusKey) : undefined
  return (
    <div className={s.layer} aria-hidden>
      {focusBox && <div className={s.focus} style={{ left: focusBox.left, top: focusBox.top, width: focusBox.width, height: focusBox.height }} />}
      {linksMode &&
        slots.map((slot, i) => {
          const b = boxes.get(slot.key)
          if (!b) return null
          return (
            <span key={slot.key} className={mergeClasses(s.badge, !urlOf(slot) && s.badgeMissing)} style={{ left: Math.max(0, b.left - 6), top: Math.max(0, b.top - 6) }}>
              {i + 1}
            </span>
          )
        })}
      {tip && (
        <div className={s.tip} style={{ left: tip.left, top: Math.max(0, tip.box.top - 4) }}>
          <div className={s.tipLabel}>{tip.label}</div>
          {tip.url ? <div>{tip.url}</div> : <div className={s.tipMissing}>{t('リンク先が未設定です(リンク先のタブで入れてください)', 'No link set (enter one in the Links tab)')}</div>}
        </div>
      )}
    </div>
  )
}
