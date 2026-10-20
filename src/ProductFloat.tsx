import { useState, type ReactNode } from 'react'
import { makeStyles } from '@fluentui/react-components'

const useStyles = makeStyles({
  anchor: { minWidth: 0 },
})

/**
 * 商品の行の開き口(X47・X54)。中ペインの「選定済み」の行と、右端の商品情報の行を押すと、onOpen を呼ぶ。
 * 開くのは、配信カードが持つ 1 つの「商品の対応のフロート」(ProductActionFloat)。
 * 行の中のボタン・入力欄・理由の文(data-no-float)を押したときは開かない(並べ替え・外す・理由の編集を邪魔しないため)
 */
export function ProductFloat({ onOpen, children }: { onOpen?: () => void; children: ReactNode }) {
  const s = useStyles()
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null)
  const fromInner = (target: EventTarget) => {
    const el = (target as HTMLElement).closest?.('button, a, input, textarea, select, [data-no-float]')
    return !!el && el !== anchor && !!anchor?.contains(el)
  }
  return (
    <div
      ref={setAnchor}
      className={s.anchor}
      onClick={(e) => {
        if (fromInner(e.target) || !onOpen) return
        onOpen()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onOpen?.()
      }}
    >
      {children}
    </div>
  )
}
