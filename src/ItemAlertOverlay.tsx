import { useCallback, useEffect, useState, type RefObject } from 'react'
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AlertFilled } from '@fluentui/react-icons'
import type { CardAlertKind } from './cardAlerts'
import { useT } from './i18n'

const useStyles = makeStyles({
  // プレビューの枠(スクロールする箱)の中に、プレビューと重ねて置く。下の操作を邪魔しないよう、層は押せない(印だけ押せる)
  layer: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, pointerEvents: 'none', zIndex: 3 },
  badge: {
    position: 'absolute',
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '3px',
    height: '20px',
    padding: '0 7px 0 5px',
    boxSizing: 'border-box',
    borderRadius: tokens.borderRadiusCircular,
    border: 'none',
    color: '#ffffff',
    fontFamily: 'inherit',
    fontSize: '11px',
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: 'nowrap',
    boxShadow: tokens.shadow4,
    cursor: 'pointer',
    pointerEvents: 'auto',
    transform: 'translate(-100%, 0)',
  },
  // 商品の枠が狭いとき(縮小したプレビューや、横に並んだ小さい枠)は、印だけにして枠からはみ出さないようにする
  compact: { width: '20px', padding: 0, justifyContent: 'center' },
})

/** 印の色(上の帯の種類の札と同じ) */
const BG: Record<CardAlertKind, string> = {
  outOfStock: tokens.colorPaletteRedBackground3,
  lowStock: tokens.colorPaletteDarkOrangeBackground3,
  policyChanged: tokens.colorPalettePurpleBackground2,
  dateChanged: tokens.colorPaletteBlueBackground2,
}

interface Box {
  left: number
  top: number
  width: number
}

interface Props {
  /** プレビューの枠(スクロールする箱。position: relative) */
  boxRef: RefObject<HTMLDivElement | null>
  /** 商品の枠の key → その商品のアラートの種類(アラートのある商品だけ) */
  kinds: Map<string, CardAlertKind>
  /** 印を押したとき(その商品のアラートへの対応を開く) */
  onOpen: (itemKey: string) => void
}

/**
 * プレビューの商品の枠に、アラートの印(在庫切れ・在庫僅少など)を重ねて出す。押すと、そのアラートへの対応を開く。
 * プレビューの部品(Preview.tsx)はほかの画面とも共通なので、印(data-item-key)を読むだけにし、ここで重ねて描く(リンク先の番号と同じやり方)
 */
export function ItemAlertOverlay({ boxRef, kinds, onOpen }: Props) {
  const s = useStyles()
  const t = useT()
  const [boxes, setBoxes] = useState<Map<string, Box>>(new Map())
  const label = (k: CardAlertKind) => ({ outOfStock: t('在庫切れ', 'Out of stock'), lowStock: t('在庫僅少', 'Low stock'), policyChanged: t('方針の変更', 'Policy'), dateChanged: t('日程', 'Date') })[k]

  const measure = useCallback(
    (el: Element): Box | null => {
      const box = boxRef.current
      if (!box) return null
      const b = box.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) return null
      // 開くときの拡大のアニメーションの途中でも、位置がずれないよう、画面上の幅と本来の幅の比で割り戻す
      const k = box.offsetWidth > 0 ? b.width / box.offsetWidth : 1
      return { left: (r.left - b.left) / k + box.scrollLeft, top: (r.top - b.top) / k + box.scrollTop, width: r.width / k }
    },
    [boxRef],
  )

  // 位置は、プレビューの中身・倍率・枠の大きさが変わるたびに変わるので、間隔を空けて測り直す
  useEffect(() => {
    if (kinds.size === 0) return
    const update = () => {
      const root = boxRef.current
      if (!root) return
      const next = new Map<string, Box>()
      for (const key of kinds.keys()) {
        const el = root.querySelector(`[data-item-key="${CSS.escape(key)}"]`)
        const m = el && measure(el)
        if (m) next.set(key, m)
      }
      setBoxes(next)
    }
    update()
    const timer = window.setInterval(update, 400)
    return () => {
      window.clearInterval(timer)
      setBoxes(new Map())
    }
  }, [kinds, boxRef, measure])

  return (
    <div className={s.layer}>
      {[...boxes].map(([key, b]) => {
        const kind = kinds.get(key)
        if (!kind) return null
        return (
          <button
            key={key}
            type="button"
            className={mergeClasses(s.badge, b.width < 90 && s.compact)}
            style={{ left: b.left + b.width - 4, top: b.top + 4, backgroundColor: BG[kind] }}
            onClick={(e) => {
              e.stopPropagation()
              onOpen(key)
            }}
            title={t('このアラートへの対応を開く', 'Handle this alert')}
            aria-label={`${label(kind)}: ${t('このアラートへの対応を開く', 'Handle this alert')}`}
          >
            <AlertFilled fontSize={12} />
            {b.width >= 90 && label(kind)}
          </button>
        )
      })}
    </div>
  )
}
