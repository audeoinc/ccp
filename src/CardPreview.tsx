import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import type { Cr854_heroimages } from './generated/models/Cr854_heroimagesModel'
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
}

/**
 * 保存されている配信カードの中身を、そのままプレビューにする(編集はしない)。
 * 週の表示・一覧のマウスを重ねたときのプレビューと、配信結果の画面で使う。
 * 商品の枠には data-item-key(`商品ID-並び順`)が付くので、外から位置を探せる
 */
export function CardPreview({ card: c, productIds, products, heroes }: Props) {
  const isPush = c.cr854_channel === CHANNEL_PUSH
  const templateId = c.cr854_layoutkey || (isPush ? DEFAULT_PUSH_TEMPLATE : templateFromValue(c.cr854_emailtemplate))
  const items: Item[] = productIds.map((pid, i) => ({ key: `${pid}-${i}`, productId: pid, reason: '', source: SOURCE_MANUAL }))
  return (
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
  )
}
