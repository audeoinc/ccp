import { useState } from 'react'
import { Button, Popover, PopoverSurface, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { BoxMultipleRegular } from '@fluentui/react-icons'
import type { Product } from './models/products'
import { ProductDetail, type ProductDetailTab } from './ProductDetail'
import { productImage } from './images'
import { useT } from './i18n'

const useStyles = makeStyles({
  // 画像とボタンを縦の 1 列に。列の幅はボタンに合わせ、画像は中央に置く
  col: { display: 'flex', flexDirection: 'column', alignItems: 'center', rowGap: '6px', flexShrink: 0 },
  imgButton: {
    display: 'block',
    padding: 0,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3,
    cursor: 'pointer',
    overflow: 'hidden',
    ':hover': { border: `1px solid ${tokens.colorBrandStroke1}`, boxShadow: tokens.shadow4 },
    ':focus-visible': { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: '1px' },
  },
  img: { display: 'block', objectFit: 'contain' },
  noImg: { display: 'block' },
})

/**
 * 見出しの商品の画像と、その下の「SKU・詳しい情報」のボタン(X63)。画像を押しても、ボタンを押しても、商品の詳しい情報を重ねて開く。
 * 配信カードの外(商品別・アラートの画面)から、SKU ごとの在庫を見るため。中身は配信カードの商品のフロートと同じ ProductDetail。
 * 置き場所は画像の下(右端では、どの商品の情報か分かりにくかったため。利用者 2026-10-21)
 */
export function ProductHeadImage({ product, size = 72, initialTab = 'sku' }: { product: Product; size?: number; initialTab?: ProductDetailTab }) {
  const t = useT()
  const s = useStyles()
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null)
  const src = productImage(product)
  const label = t('SKU・詳しい情報を開く', 'Open SKUs & details')
  return (
    <div ref={setAnchor} className={s.col}>
      <Tooltip content={label} relationship="label">
        <button type="button" className={s.imgButton} onClick={() => setOpen(true)}>
          {src ? <img className={s.img} src={src} alt="" draggable={false} style={{ width: size, height: size }} /> : <span className={s.noImg} style={{ width: size, height: size }} />}
        </button>
      </Tooltip>
      <Button size="small" appearance="secondary" icon={<BoxMultipleRegular />} onClick={() => setOpen(true)}>
        {t('SKU・詳しい情報', 'SKUs & details')}
      </Button>
      <Popover open={open} onOpenChange={(_, d) => setOpen(d.open)} withArrow positioning={{ target: anchor, position: 'below', align: 'start' }} trapFocus>
        <PopoverSurface>
          {/* 開くたびに作り直す(前に見たタブを引きずらず、決めたタブで開く) */}
          {open && <ProductDetail key={product.id} product={product} initialTab={initialTab} onClose={() => setOpen(false)} />}
        </PopoverSurface>
      </Popover>
    </div>
  )
}
