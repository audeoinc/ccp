import { useState } from 'react'
import { Button, Popover, PopoverSurface, PopoverTrigger } from '@fluentui/react-components'
import { BoxMultipleRegular } from '@fluentui/react-icons'
import type { Product } from './models/products'
import { ProductDetail, type ProductDetailTab } from './ProductDetail'
import { useT } from './i18n'

/**
 * 商品の詳しい情報(SKU・売上と在庫・指標など)を、その場で重ねて開くボタン(X63)。
 * 配信カードの外(商品別・アラートの画面)から、SKU ごとの在庫を見るため。中身は配信カードの商品のフロートと同じ ProductDetail
 */
export function ProductDetailButton({ product, initialTab = 'sku' }: { product: Product; initialTab?: ProductDetailTab }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={(_, d) => setOpen(d.open)} withArrow positioning="below-end" trapFocus>
      <PopoverTrigger disableButtonEnhancement>
        <Button size="small" appearance="secondary" icon={<BoxMultipleRegular />}>
          {t('SKU・詳しい情報', 'SKUs & details')}
        </Button>
      </PopoverTrigger>
      <PopoverSurface>
        {/* 開くたびに作り直す(前に見たタブを引きずらず、決めたタブで開く) */}
        {open && <ProductDetail key={product.id} product={product} initialTab={initialTab} onClose={() => setOpen(false)} />}
      </PopoverSurface>
    </Popover>
  )
}
