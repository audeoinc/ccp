import type { ReactElement } from 'react'
import { Popover, PopoverSurface, PopoverTrigger } from '@fluentui/react-components'
import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import type { Cr854_heroimages } from './generated/models/Cr854_heroimagesModel'
import { FitPreview } from './FitPreview'
import { SOURCE_MANUAL, type Item } from './items'
import { Preview } from './Preview'
import { parsePushLink } from './pushLink'
import { CHANNEL_PUSH } from './status'
import { DEFAULT_PUSH_TEMPLATE, templateFromValue } from './templates'

/** セクションのコピー(JSON の配列。古い形式の改行区切りも読む) */
const parseCopies = (v?: string): string[] => {
  if (!v) return []
  try {
    const a = JSON.parse(v)
    if (Array.isArray(a)) return a.map(String)
  } catch {
    // JSON でなければ、改行区切りとして読む
  }
  return v.split('\n')
}
const noop = () => undefined

interface Props {
  card: Cr854_deliverycards
  /** 掲載商品(メールの並び順の商品 ID) */
  productIds: string[]
  products: Cr854_products[]
  heroes: Cr854_heroimages[]
  /** マウスを重ねる対象(サムネイルや「プレビュー」の文字) */
  children: ReactElement
}

/**
 * マウスを重ねると、配信の全体(メール / アプリの通知とメッセージ)を、スクロールなしで見せる。
 * 週の表示・一覧で、画像を次々に確かめるために使う。細かく見るときは、押して配信カードを開く。
 */
export function DeliveryPeek({ card: c, productIds, products, heroes, children }: Props) {
  const isPush = c.cr854_channel === CHANNEL_PUSH
  const templateId = c.cr854_layoutkey || (isPush ? DEFAULT_PUSH_TEMPLATE : templateFromValue(c.cr854_emailtemplate))
  const items: Item[] = productIds.map((pid, i) => ({ key: `${pid}-${i}`, productId: pid, reason: '', source: SOURCE_MANUAL }))
  return (
    <Popover openOnHover mouseLeaveDelay={50} positioning="after" withArrow>
      <PopoverTrigger disableButtonEnhancement>{children}</PopoverTrigger>
      <PopoverSurface>
        <FitPreview>
          <Preview
            channel={isPush ? 'push' : 'email'}
            pushLinkKind={parsePushLink(c.cr854_pushlink)?.kind}
            pushTitle={c.cr854_pushtitle}
            pushBody={c.cr854_pushbody}
            subject={c.cr854_name}
            headline={c.cr854_headline ?? ''}
            copy={c.cr854_copy ?? ''}
            items={items}
            products={products}
            selectedKey={null}
            showHeadings
            template={templateId}
            scheduledAt={c.cr854_scheduledat ?? ''}
            sectionTitles={(c.cr854_sectiontitles ?? '').split('\n')}
            onSectionTitle={noop}
            sectionCopies={parseCopies(c.cr854_sectioncopies)}
            onSectionCopy={noop}
            hero={heroes.find((h) => h.cr854_heroimageid === c._cr854_heroimage_value)}
            onDropHero={noop}
            onClearHero={noop}
            onSelect={noop}
            onRemove={noop}
            onMove={noop}
            onDropAt={noop}
          />
        </FitPreview>
      </PopoverSurface>
    </Popover>
  )
}
