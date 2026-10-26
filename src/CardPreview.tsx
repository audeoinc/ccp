import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { SOURCE_MANUAL, type Item } from './items'
import { Preview } from './Preview'
import { parsePushLink } from './pushLink'
import { CHANNEL_PUSH } from './status'
import { templateKeyOfCard } from './templates'

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
  card: DeliveryCard
  /** 掲載商品(メールの並び順の商品 ID) */
  productIds: string[]
  products: Product[]
  heroes: HeroImage[]
  /** メールの幅(スマホ / PC)。渡さなければ、これまでどおりの幅 */
  device?: 'mobile' | 'pc'
}

/**
 * 保存されている配信カードの中身を、そのままプレビューにする(編集はしない)。
 * 週の表示・一覧のマウスを重ねたときのプレビュー、配信結果の画面、まとめて作るの案のプレビューで使う。
 * 商品の枠には data-item-key(`商品ID-並び順`)が付くので、外から位置を探せる
 */
export function CardPreview({ card: c, productIds, products, heroes, device }: Props) {
  const isPush = c.channel === CHANNEL_PUSH
  // 使った版の形で描く
  const templateId = templateKeyOfCard(c)
  const items: Item[] = productIds.map((pid, i) => ({ key: `${pid}-${i}`, productId: pid, reason: '', source: SOURCE_MANUAL }))
  return (
    <Preview
      channel={isPush ? 'push' : 'email'}
      country={c.country ?? undefined}
      pushLinkKind={parsePushLink(c.push_link)?.kind}
      pushTitle={c.push_title}
      pushBody={c.push_body}
      subject={c.name}
      subjectLine={c.subject}
      preheader={c.preheader}
      device={device}
      headline={c.headline ?? ''}
      copy={c.copy ?? ''}
      items={items}
      products={products}
      selectedKey={null}
      showHeadings
      template={templateId}
      scheduledAt={c.scheduled_at ?? ''}
      sectionTitles={(c.section_titles ?? '').split('\n')}
      onSectionTitle={noop}
      sectionCopies={parseCopies(c.section_copies)}
      onSectionCopy={noop}
      hero={heroes.find((h) => h.id === c.hero_image_id)}
      onDropHero={noop}
      onClearHero={noop}
      onSelect={noop}
      onRemove={noop}
      onMove={noop}
      onDropAt={noop}
    />
  )
}
