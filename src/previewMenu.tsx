import { ArrowSwapRegular, DismissRegular, EditRegular, OpenRegular, SparkleRegular } from '@fluentui/react-icons'
import type { ContextItem } from './ContextMenu'
import { tr } from './i18n'

/**
 * プレビューの右クリックの項目(「ここにピンを打つ」のあと)。配信カードの詳しい画面とシンプルな画面で、並び・文言・押せなくする条件をそろえる。
 * 何をするか(どのタブ・ペイン・フロートを開くか)は、画面ごとに渡す。渡さなかった項目は出さない
 */
export interface PreviewMenuSpec {
  /** 保存・反映の間は、中身を変える項目を押せなくする(ボタンと同じ。確定した週は、保存のときに理由を聞く) */
  busy: boolean
  /** この部品を直す */
  edit?: () => void
  /** この部品について AI に頼む */
  ai?: () => void
  /** 押した所が商品の枠のとき */
  product?: { swapLabel: string; url?: string; swap: () => void; remove: () => void }
  /** 押した所がメイン画像のとき */
  hero?: { src?: string; replace: () => void }
}

export function previewMenuItems({ busy, edit, ai, product, hero }: PreviewMenuSpec): ContextItem[] {
  const list: ContextItem[] = []
  if (edit) list.push({ key: 'edit', label: tr('この部品を直す', 'Edit this part'), icon: <EditRegular />, onSelect: edit })
  if (ai) list.push({ key: 'ai', label: tr('この部品について AI に頼む', 'Ask AI about this part'), icon: <SparkleRegular />, onSelect: ai })
  if (product) {
    const { url } = product
    list.push(
      { key: 'swap', label: product.swapLabel, icon: <ArrowSwapRegular />, divider: true, disabled: busy, onSelect: product.swap },
      { key: 'page', label: tr('商品ページを開く', 'Open the product page'), icon: <OpenRegular />, disabled: !url, onSelect: () => window.open(url, '_blank', 'noreferrer') },
      { key: 'remove', label: tr('この商品を外す', 'Remove this product'), icon: <DismissRegular />, disabled: busy, onSelect: product.remove },
    )
  }
  if (hero) {
    const { src } = hero
    list.push(
      { key: 'replace', label: tr('画像を入れ替える', 'Replace the image'), icon: <ArrowSwapRegular />, divider: true, disabled: busy, onSelect: hero.replace },
      { key: 'tab', label: tr('画像を新しいタブで開く', 'Open the image in a new tab'), icon: <OpenRegular />, disabled: !src, onSelect: () => window.open(src, '_blank', 'noreferrer') },
    )
  }
  return list
}
