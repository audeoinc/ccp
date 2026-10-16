import type { ReactElement } from 'react'
import { Popover, PopoverSurface, PopoverTrigger } from '@fluentui/react-components'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { CardPreview } from './CardPreview'
import { FitPreview } from './FitPreview'

interface Props {
  card: DeliveryCard
  /** 掲載商品(メールの並び順の商品 ID) */
  productIds: string[]
  products: Product[]
  heroes: HeroImage[]
  /** マウスを重ねる対象(サムネイルや「プレビュー」の文字) */
  children: ReactElement
}

/**
 * マウスを重ねると、配信の全体(メール / アプリの通知とメッセージ)を、スクロールなしで見せる。
 * 週の表示・一覧で、画像を次々に確かめるために使う。細かく見るときは、押して配信カードを開く。
 */
export function DeliveryPeek({ card, productIds, products, heroes, children }: Props) {
  return (
    <Popover openOnHover mouseLeaveDelay={50} positioning="after" withArrow>
      <PopoverTrigger disableButtonEnhancement>{children}</PopoverTrigger>
      <PopoverSurface>
        <FitPreview>
          <CardPreview card={card} productIds={productIds} products={products} heroes={heroes} />
        </FitPreview>
      </PopoverSurface>
    </Popover>
  )
}
