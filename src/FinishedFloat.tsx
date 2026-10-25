import { useState } from 'react'
import { Badge, Button, Dialog, DialogBody, DialogTitle, makeStyles, tokens } from '@fluentui/react-components'
import { ResizableSurface } from './ResizableSurface'
import { DismissRegular, OpenRegular } from '@fluentui/react-icons'
import { CreativeAssets } from './CreativeAssets'
import { HtmlPreviewFrame } from './HtmlPreviewFrame'
import { MarkdownLite } from './MarkdownLite'
import { useT, when } from './i18n'
import type { DeliveryCard } from './models/deliveryCards'
import type { ProductionRequest } from './models/productionRequests'
import type { Product } from './models/products'
import type { VariantKey } from './abTest'
import { parseVariantHtml } from './productionSnapshot'

const useStyles = makeStyles({
  surface: { width: 'min(1400px, (96vw / var(--ui-zoom, 1)))', maxWidth: 'none', height: 'calc(90vh / var(--ui-zoom, 1))' },
  body: { height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 },
  titleRow: { display: 'flex', alignItems: 'center', columnGap: '8px' },
  variants: { display: 'inline-flex', columnGap: '2px' },
  grow: { flexGrow: 1, minWidth: 0 },
  cols: { display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(320px, 2fr)', columnGap: '16px', minHeight: 0, flexGrow: 1, marginTop: '8px' },
  preview: { display: 'flex', flexDirection: 'column', minHeight: 0 },
  side: { display: 'grid', rowGap: '14px', alignContent: 'start', minHeight: 0, overflow: 'auto', paddingRight: '4px' },
  block: { display: 'grid', rowGap: '4px' },
  head: { fontWeight: tokens.fontWeightSemibold },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  text: { whiteSpace: 'pre-wrap', fontSize: tokens.fontSizeBase300 },
  link: { overflowWrap: 'anywhere', fontSize: tokens.fontSizeBase200 },
  empty: { display: 'grid', placeItems: 'center', flexGrow: 1, color: tokens.colorNeutralForeground3, border: `1px dashed ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusMedium },
})


interface Props {
  card: DeliveryCard
  /** いちばん新しい制作の依頼(版) */
  request: ProductionRequest
  people: string[]
  productIds: string[]
  products: Product[]
  onClose: () => void
}

/**
 * 仕上がりを見る(X58 段階 4。利用者の要望 2026-10-21: 制作したもの・説明・それに要る素材を、1 か所で見たい)。
 * 左に制作した HTML のプレビュー、右に「制作が終わった」のひとことと、できたもののリンク・制作指示・直してほしいこと・素材(コメントもできる)。
 * 企画側が仕上がりを確かめるときに使う。制作のページの工程の帯と、配信カードの「制作」の札から開く
 */
export function FinishedFloat({ card, request: r, people, productIds, products, onClose }: Props) {
  const s = useStyles()
  const t = useT()
  // AB テスト(全案を送る)は、案ごとの HTML を切り替えて見る
  const others = parseVariantHtml(r.variant_html)
  const keys: VariantKey[] = ['A', ...(['B', 'C'] as const).filter((k) => others[k])]
  const [variant, setVariant] = useState<VariantKey>('A')
  const html = variant === 'A' ? (r.html ?? '') : (others[variant]?.html ?? '')
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <ResizableSurface sizeKey="finished" className={s.surface}>
        <DialogBody className={s.body}>
          <div className={s.titleRow}>
            <DialogTitle className={s.grow}>{t(`仕上がり — ${card.name ?? ''}`, `Result — ${card.name ?? ''}`)}</DialogTitle>
            {keys.length > 1 && (
              <span className={s.variants} role="tablist" aria-label={t('案', 'Variants')}>
                {keys.map((k) => (
                  <Button key={k} size="small" role="tab" aria-selected={variant === k} appearance={variant === k ? 'primary' : 'subtle'} onClick={() => setVariant(k)}>
                    {t(`${k} 案`, `Variant ${k}`)}
                  </Button>
                ))}
              </span>
            )}
            <Badge appearance="outline">{t(`版 ${r.version ?? 1}`, `v${r.version ?? 1}`)}</Badge>
            {r.checked_at ? (
              <Badge appearance="tint" color="success">{t('確認済み', 'Checked')}</Badge>
            ) : r.done_at ? (
              <Badge appearance="tint" color="warning">{t('確認待ち', 'Awaiting check')}</Badge>
            ) : (
              <Badge appearance="tint" color="informative">{t('制作中', 'In production')}</Badge>
            )}
            <Button appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label={t('閉じる', 'Close')} />
          </div>
          <div className={s.cols}>
            <div className={s.preview}>
              {html ? (
                <HtmlPreviewFrame html={html} title={t('制作した HTML のプレビュー', 'Production HTML preview')} heading={keys.length > 1 ? t(`制作した HTML(${variant} 案)`, `Production HTML (variant ${variant})`) : t('制作した HTML', 'Production HTML')} />
              ) : (
                <div className={s.empty}>{t('まだ制作した HTML が保存されていません(制作のページで保存すると、ここに出ます)', 'No production HTML saved yet (it appears here once saved on the production page)')}</div>
              )}
            </div>
            <div className={s.side}>
              <div className={s.block}>
                <span className={s.head}>{t('制作からのひとこと', 'Note from production')}</span>
                {r.done_at ? (
                  <>
                    <span className={s.note}>{t(`${r.done_by_name ?? ''} ${when(r.done_at)} に制作が終わった`, `Done by ${r.done_by_name ?? ''} ${when(r.done_at)}`)}</span>
                    {r.done_note ? <span className={s.text}>{r.done_note}</span> : <span className={s.note}>{t('(ひとことなし)', '(no note)')}</span>}
                  </>
                ) : (
                  <span className={s.note}>{t('まだ「制作が終わった」になっていません', 'Not marked as done yet')}</span>
                )}
              </div>
              <div className={s.block}>
                <span className={s.head}>{t('できたもののリンク', 'Link to the result')}</span>
                {r.done_link ? (
                  <>
                    <span className={s.link}>{r.done_link}</span>
                    <Button size="small" icon={<OpenRegular />} as="a" href={r.done_link} target="_blank" rel="noreferrer" style={{ justifySelf: 'start' }}>
                      {t('開く', 'Open')}
                    </Button>
                  </>
                ) : (
                  <span className={s.note}>{t('(リンクなし)', '(no link)')}</span>
                )}
              </div>
              {r.revision_note && (
                <div className={s.block}>
                  <span className={s.head}>{t('直してほしいと伝えたこと', 'Fix requested')}</span>
                  <span className={s.note}>{`${r.revision_by_name ?? ''} ${when(r.revision_at)}`}</span>
                  <span className={s.text}>{r.revision_note}</span>
                </div>
              )}
              <div className={s.block}>
                <span className={s.head}>{t('制作指示', 'Production notes')}</span>
                {r.instructions?.trim() ? <MarkdownLite text={r.instructions} /> : <span className={s.note}>{t('(なし)', '(none)')}</span>}
              </div>
              <CreativeAssets
                cardId={card.id}
                stage="production"
                owner={card.owner}
                people={people}
                cardName={card.name ?? ''}
                productionOwner={r.production_owner ?? ''}
                productionDue={r.production_due ?? ''}
                productIds={productIds}
                products={products}
              />
            </div>
          </div>
        </DialogBody>
      </ResizableSurface>
    </Dialog>
  )
}
