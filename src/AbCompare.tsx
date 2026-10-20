import { Button, Dialog, DialogBody, DialogContent, DialogSurface, DialogTitle, makeStyles, tokens } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import { CardPreview } from './CardPreview'
import { splitOf, targetLabel, type AbTest, type VariantKey } from './abTest'
import { useT } from './i18n'
import type { DeliveryCard } from './models/deliveryCards'
import type { HeroImage } from './models/heroImages'
import type { Product } from './models/products'

const useStyles = makeStyles({
  surface: { width: 'min(1500px, 96vw)', maxWidth: 'none', height: '90vh', display: 'flex', flexDirection: 'column' },
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
}

interface Props {
  ab: AbTest
  /** 全案で共通の中身(いま編集中の値。テーマ・コピーなど) */
  base: DeliveryCard
  variants: CompareVariant[]
  products: Product[]
  heroes: HeroImage[]
  onEdit: (k: VariantKey) => void
  onClose: () => void
}

/**
 * AB テストの案を、プレビューで横に並べて比べる(X55 段階 3)。見るだけ。直すときは「この案を直す」で、その案に切り替えて閉じる
 */
export function AbCompare({ ab, base, variants, products, heroes, onEdit, onClose }: Props) {
  const s = useStyles()
  const t = useT()
  const split = splitOf(ab)
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? ''
  const heroName = (id?: string) => heroes.find((h) => h.id === id)?.name ?? t('(なし)', '(none)')
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface className={s.surface}>
        <DialogBody className={s.body}>
          <div className={s.head}>
            <DialogTitle className={s.grow}>{t('案を並べて比べる', 'Compare variants side by side')}</DialogTitle>
            <Button appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label={t('閉じる', 'Close')} />
          </div>
          <DialogContent className={s.content}>
            <span className={s.note}>
              {t(`比べるのは${targetLabel(ab.target)}。それ以外は全案で共通です(保存前の、いま編集中の中身で出しています)`, `Comparing the ${targetLabel(ab.target).toLowerCase()}. Everything else is shared (shows the unsaved content you are editing).`)}
            </span>
            <div className={s.cols}>
              {variants.map((v) => (
                <div key={v.key} className={s.col}>
                  <div className={s.colHead}>
                    <div className={s.head}>
                      <span className={s.colTitle}>{t(`${v.key} 案`, `Variant ${v.key}`)}</span>
                      <span className={s.note}>{t(`配分 ${split[v.key]}%`, `${split[v.key]}% of recipients`)}</span>
                      <span className={s.grow} />
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
                    </div>
                    {ab.target !== 'products' && <span className={s.note}>{t(`メイン画像: ${heroName(v.heroId)}`, `Hero: ${heroName(v.heroId)}`)}</span>}
                    {ab.target !== 'hero' && <span className={s.note}>{t(`商品: ${v.productIds.map(productName).filter(Boolean).join(' / ') || '(なし)'}`, `Products: ${v.productIds.map(productName).filter(Boolean).join(' / ') || '(none)'}`)}</span>}
                  </div>
                  <div className={s.scroll}>
                    <div className={s.zoom}>
                      <CardPreview card={{ ...base, hero_image_id: v.heroId ?? null }} productIds={v.productIds} products={products} heroes={heroes} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
