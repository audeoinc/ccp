import { Button, Dialog, DialogBody, DialogContent, DialogTitle, makeStyles, tokens } from '@fluentui/react-components'
import { ResizableSurface } from './ResizableSurface'
import { DismissRegular } from '@fluentui/react-icons'
import { CardPreview } from './CardPreview'
import { isChoose, splitOf, targetLabel, type AbTarget, type AbTest, type VariantKey, type VariantText } from './abTest'
import { useT } from './i18n'
import type { DeliveryCard } from './models/deliveryCards'
import type { HeroImage } from './models/heroImages'
import type { Product } from './models/products'

const useStyles = makeStyles({
  surface: { width: 'min(1500px, (96vw / var(--ui-zoom, 1)))', maxWidth: 'none', height: 'calc(90vh / var(--ui-zoom, 1))', display: 'flex', flexDirection: 'column' },
  body: { display: 'flex', flexDirection: 'column', minHeight: 0, flexGrow: 1 },
  content: { display: 'flex', flexDirection: 'column', minHeight: 0, flexGrow: 1, rowGap: '8px' },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px' },
  grow: { flexGrow: 1 },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  cols: { display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(0, 1fr)', columnGap: '12px', minHeight: 0, flexGrow: 1 },
  col: { display: 'flex', flexDirection: 'column', minHeight: 0, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium },
  colHead: { display: 'grid', rowGap: '2px', padding: '8px 10px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground2 },
  colTitle: { fontWeight: tokens.fontWeightSemibold },
  scroll: { overflow: 'auto', minHeight: 0, flexGrow: 1, padding: '8px', backgroundColor: tokens.colorNeutralBackground3 },
  // 3 案を横に並べても全体が見えるよう、縮めて出す
  zoom: { zoom: 0.55 },
})

export interface CompareVariant {
  key: VariantKey
  productIds: string[]
  heroId?: string
  /** 案ごとの文言(なければ、共通の中身のまま) */
  texts?: VariantText
  /** 見出しの横の札(例: 「配信しなかった」) */
  tag?: string
}

interface Props {
  /** 案を持つ配信の設定。決めたあとの見返し(読むだけ)は null で、target を渡す */
  ab: AbTest | null
  target?: AbTarget
  /** 全案で共通の中身(いま編集中の値。テーマ・コピーなど) */
  base: DeliveryCard
  variants: CompareVariant[]
  products: Product[]
  heroes: HeroImage[]
  /** 「この案を直す」(読むだけのときは渡さない) */
  onEdit?: (k: VariantKey) => void
  onClose: () => void
}

/**
 * AB テストの案を、プレビューで横に並べて比べる(X55 段階 3)。見るだけ。直すときは「この案を直す」で、その案に切り替えて閉じる
 */
export function AbCompare({ ab, target: targetProp, base, variants, products, heroes, onEdit, onClose }: Props) {
  const s = useStyles()
  const t = useT()
  const split = ab && !isChoose(ab) ? splitOf(ab) : null
  const target: AbTarget = ab?.target ?? targetProp ?? 'both'
  // 案の文言を、配信の列の形にして重ねる
  const withTexts = (x?: VariantText): Partial<DeliveryCard> =>
    x ? { headline: x.headline, copy: x.copy, push_title: x.pushTitle, push_body: x.pushBody, subject: x.subject, preheader: x.preheader, section_titles: x.sectionTitles.join('\n'), section_copies: x.sectionCopies.some(Boolean) ? JSON.stringify(x.sectionCopies) : '' } : {}
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? ''
  const heroName = (id?: string) => heroes.find((h) => h.id === id)?.name ?? t('(なし)', '(none)')
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <ResizableSurface sizeKey="abCompare" className={s.surface}>
        <DialogBody className={s.body}>
          <div className={s.head}>
            <DialogTitle className={s.grow}>{t('案を並べて比べる', 'Compare variants side by side')}</DialogTitle>
            <Button appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label={t('閉じる', 'Close')} />
          </div>
          <DialogContent className={s.content}>
            <span className={s.note}>
              {ab
                ? t(`案ごとに違うのは${targetLabel(target)}。それ以外は全案で共通です(保存前の、いま編集中の中身で出しています)`, `Variants differ in the ${targetLabel(target).toLowerCase()}. Everything else is shared (shows the unsaved content you are editing).`)
                : t(`配信した案と、配信しなかった案です(案ごとに違うのは${targetLabel(target)})。見るだけです`, `The variant sent and the variants not sent (they differ in the ${targetLabel(target).toLowerCase()}). Read-only.`)}
            </span>
            <div className={s.cols}>
              {variants.map((v) => (
                <div key={v.key} className={s.col}>
                  <div className={s.colHead}>
                    <div className={s.head}>
                      <span className={s.colTitle}>{t(`${v.key} 案`, `Variant ${v.key}`)}</span>
                      {split && <span className={s.note}>{t(`配分 ${split[v.key]}%`, `${split[v.key]}% of recipients`)}</span>}
                      {v.tag && <span className={s.note}>{v.tag}</span>}
                      <span className={s.grow} />
                      {onEdit && (
                        <Button
                          size="small"
                          appearance="secondary"
                          onClick={() => {
                            onEdit(v.key)
                            onClose()
                          }}
                        >
                          {t('この案を直す', 'Edit this variant')}
                        </Button>
                      )}
                    </div>
                    {v.texts && (target === 'subject' || target === 'all') && <span className={s.note}>{t(`件名: ${v.texts.subject || '(配信名)'}`, `Subject: ${v.texts.subject || '(delivery name)'}`)}</span>}
                    {v.texts && target !== 'subject' && <span className={s.note}>{t(`ヘッドライン: ${v.texts.headline || '(なし)'}`, `Headline: ${v.texts.headline || '(none)'}`)}</span>}
                    {target !== 'products' && target !== 'subject' && <span className={s.note}>{t(`メイン画像: ${heroName(v.heroId)}`, `Hero: ${heroName(v.heroId)}`)}</span>}
                    {target !== 'hero' && target !== 'subject' && <span className={s.note}>{t(`商品: ${v.productIds.map(productName).filter(Boolean).join(' / ') || '(なし)'}`, `Products: ${v.productIds.map(productName).filter(Boolean).join(' / ') || '(none)'}`)}</span>}
                  </div>
                  <div className={s.scroll}>
                    <div className={s.zoom}>
                      <CardPreview card={{ ...base, ...withTexts(v.texts), hero_image_id: v.heroId ?? null }} productIds={v.productIds} products={products} heroes={heroes} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </DialogContent>
        </DialogBody>
      </ResizableSurface>
    </Dialog>
  )
}
