import { useState, type ReactNode } from 'react'
import { Badge, Button, Dialog, DialogBody, makeStyles, tokens } from '@fluentui/react-components'
import { ResizableSurface } from './ResizableSurface'
import { ArrowLeftRegular, ArrowSwapRegular, CalendarArrowRightRegular, DismissRegular, ImageEditRegular, OpenRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { DeliveryProductSource as Source } from './models/deliveryProducts'
import type { CardAlert, CardAlertKind } from './cardAlerts'
import type { StockModel } from './alerts'
import { replacementCandidates, type ReplacementCandidate } from './alertActions'
import { ProductChooser, ProductLine } from './ProductChooser'
import type { AiCard } from './aiSelect'
import { ProductDetail } from './ProductDetail'
import { LowStockBadge } from './ProductMarks'
import { ImageThumb } from './ImageThumb'
import { productImage } from './images'
import { num, tr, useT } from './i18n'
import { OpenLink } from './LinkText'
import { productUrl } from './links'
import { weeklyLimit } from './weeklyLimit'
import { ProductImagePicker, type DeliveryGist } from './ProductImagePicker'
import { typo } from './typo'

// 商品の対応のフロート(X54)。「このアラートへの対応」(X30)と「商品のフロート」(X47)を 1 つにしたもの。
// どこから開いても同じ形: いまの商品の詳しい情報。題の行の「入れ替える」を押すと、同じフロートの中が入れ替えの部品(AI のおすすめ・AI に頼む・すべての商品)に
// 切り替わり、「詳しい情報に戻る」で戻る(以前は左に入れ替えの欄があったが、16 で候補の一覧をやめてボタンだけになったので、2026-10-26 利用者と決めて、なくした)。
// アラートの札から開くと、上にアラートの内容とアラートごとの操作(配信日を変える など)。
// 入れ替えの流れは、シンプルな配信カードの引き出し(simple/ProductSwap)と 1 つにした(simple-ui-review-2 の 16。2026-10-25 利用者と決めた):
// 候補を押すとすぐ入れ替わり、理由は聞かない(戻すのは「元に戻す」か、保存しないこと。理由は、確定した週の保存の理由と変更の履歴に任せる)

/** 残りの候補(中ペインの「残りの候補」と同じもの・同じ順番) */
export interface SwapOption {
  key: string
  product: Product
  reason: string
  source: Source
}

const useStyles = makeStyles({
  // 高さを中身に合わせると、右のタブ(売上・在庫 / 詳細 / SKU …)を替えるたびに高さが変わり、真ん中に置いたフロートの上端が動いた(X70)。
  // 高さを決めて、中身は左右の欄の中でスクロールさせる(つまみで変えた大きさを覚えていれば、そちらが勝つ)
  // 幅は、詳しい情報(ProductDetail の 520px。グラフは幅に合わせて文字も大きくなるので、広げない)が収まる大きさ
  surface: { width: 'min(600px, (96vw / var(--ui-zoom, 1)))', maxWidth: 'none', height: 'min(760px, calc(88vh / var(--ui-zoom, 1)))', maxHeight: 'calc(88vh / var(--ui-zoom, 1))', display: 'flex', flexDirection: 'column', padding: '14px 18px' },
  body: { display: 'flex', flexDirection: 'column', rowGap: '10px', minHeight: 0, flexGrow: 1 },
  // 題の行(ほかのフロートと同じ形: 題・右端に ×)。行をつかむと動かせる(プレビューを見ながら選べるように)
  grab: { display: 'flex', alignItems: 'center', columnGap: '8px', cursor: 'move', userSelect: 'none', touchAction: 'none' },
  grabTitle: { ...typo.heading, minWidth: 0, flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  alert: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: '10px', rowGap: '6px', padding: '8px 12px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorPaletteDarkOrangeBackground1, border: `1px solid ${tokens.colorPaletteDarkOrangeBorder1}` },
  alertText: { display: 'grid', rowGap: '2px', flexGrow: 1, minWidth: 0 },
  alertDetail: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  // 入れ替えの画面のいちばん上の、いまの商品の 1 行
  now: { display: 'flex', alignItems: 'center', columnGap: '10px', padding: '6px 10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
  nowLabel: { ...typo.label, flexShrink: 0 },
  // 中身(詳しい情報・入れ替え)は、この中でスクロールする
  pane: { display: 'grid', alignContent: 'start', rowGap: '10px', overflowY: 'auto', minHeight: 0, flexGrow: 1, paddingRight: '6px' },
  sectionHead: { display: 'flex', alignItems: 'center', columnGap: '6px', ...typo.heading },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  marks: { display: 'flex', flexWrap: 'wrap', gap: '4px' },
  others: { display: 'flex', flexWrap: 'wrap', columnGap: '8px', rowGap: '6px' },
  imageBox: { display: 'grid', gridTemplateColumns: '56px minmax(0, 1fr)', columnGap: '10px', alignItems: 'center', padding: '8px 10px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}` },
  imageText: { display: 'grid', rowGap: '4px', justifyItems: 'start', minWidth: 0 },
})

interface Props {
  /** 対応する商品(配信に載っている商品)。日程の変更など、商品のないアラートでは、ない */
  product?: Product
  /** アラートの札から開いたときの、そのアラート */
  alert?: CardAlert
  /** 配信(国・ID)。AI の差し替え案の決め方に使う */
  card?: DeliveryCard
  /** いまの配信日時(配信カードで書き換え中の値) */
  scheduledAt: string
  /** いまこの配信に載っている商品(候補から外し、検索では「掲載中」) */
  inCard: Set<string>
  products: Product[]
  /** ほかの商品を探すときの対象(配信カードの国の商品だけ。配信の対象の性別も効く) */
  poolProducts: Product[]
  model?: StockModel
  /** この週に、商品を載せる配信の数(週の上限の印。上限に届いた商品は、AI の案から除く) */
  weekUse?: Map<string, number>
  /** 商品 ID → いちばん強いアラートの種類(候補・検索の印) */
  alertKinds?: Map<string, CardAlertKind>
  /** 残りの候補(このセクション) */
  options: SwapOption[]
  /** 残りの候補と入れ替える(行 ID のまま入れ替わる。reason は候補の AI の理由) */
  onSwapCandidate?: (candKey: string, reason: string) => void
  /** ほかの商品(AI の案・検索)に置き換える(reason は AI の理由。すべての商品から選んだときは空) */
  onReplace?: (to: Product, reason: string) => void
  /** この配信で使う、この商品の画像(空 = 商品のマスタの画像。X64) */
  image?: string
  /** 画像を選ぶときに AI に渡す、配信で伝えたいこと */
  delivery?: DeliveryGist
  /** この配信で使う画像を替える(url が空なら、商品のマスタの画像に戻す) */
  onImage?: (url: string, source: string) => void
  /** 配信日を変える(左の配信日時の欄へ) */
  onPostpone?: () => void
  /** アラートの画面で詳しく見る */
  onOpenAlerts?: () => void
  /** 選んでいる枠への操作(シンプルな配信カードで、プレビューの枠を選んでから一覧の商品を押したとき。「この枠の商品と入れ替える」など。SU1 ⑩) */
  slotAction?: { label: string; run: () => void; note?: string; backLabel?: string }
  /** AI に渡す、配信のいまの入力(差し替えの候補を AI に選んでもらうとき) */
  aiCard: () => AiCard
  /** 配信の切り口(AI に渡す) */
  angle: string
  /**
   * 「入れ替える」を押したときに、フロートの中に出す入れ替えの部品(シンプルな配信カード。どの入口でも同じ引き出し simple/ProductSwap。SU9)。
   * 渡さなければ、同じ形の ProductChooser を出す(詳しい画面・アラート)
   */
  renderSwap?: SwapRender
  onClose: () => void
}

/** フロートの中に出す入れ替えの部品(back = 詳しい情報に戻る、close = フロートを閉じる。入れ替えたあと) */
export type SwapRender = (back: () => void, close: () => void) => ReactNode

/** 商品の対応のフロート(X54) */
export function ProductActionFloat({ product, alert, card, scheduledAt, inCard, products, poolProducts, model, weekUse, alertKinds, options, image, delivery, onImage, onSwapCandidate, onReplace, onPostpone, onOpenAlerts, slotAction, renderSwap, aiCard, angle, onClose }: Props) {
  const s = useStyles()
  const t = useT()
  const [picking, setPicking] = useState(false)

  // AI の差し替え案(在庫・週の上限のアラートから開いたとき。開いたときに 1 回だけ)
  const overLimit = alert?.kind === 'overLimit'
  const stockAlert = !!alert && (alert.kind === 'outOfStock' || alert.kind === 'lowStock' || overLimit)
  // モデルの使用期限(アラートの画面には出ない。この配信で使う画像を替えるか、商品を差し替えて直す)
  const imageAlert = alert?.kind === 'imageExpired'
  // 差し替えの候補(在庫・週の上限のアラートから開いたとき): 在庫の見込みを確かめた、同じカテゴリの商品。AI はこの中から選ぶ
  const [stockCandidates] = useState<ReplacementCandidate[] | undefined>(() => {
    if (!stockAlert || !product || !model || !card) return undefined
    const when = scheduledAt ? new Date(scheduledAt).toISOString() : (card.scheduled_at ?? new Date().toISOString())
    return replacementCandidates({ card, removed: product, products, model, inCard, when }).filter((c) => !overLimit || (weekUse?.get(c.product.id) ?? 0) < weeklyLimit(card))
  })
  // 差し替える理由(AI に渡す)
  // 在庫・週の上限のアラートから開いたときは、入れ替えるのが主なので、入れ替えから始める
  const [view, setView] = useState<'detail' | 'swap'>(stockAlert && !!product ? 'swap' : 'detail')
  const canSwap = !!product && (!!renderSwap || !!onReplace)
  const swapWhy = !stockAlert ? undefined : overLimit ? tr(`この週に ${weeklyLimit(card)} 本を超えて載せている`, `featured in more than ${weeklyLimit(card)} deliveries this week`) : alert?.detail || tr('在庫が持たない見込み', 'likely to run out of stock')

  const kindName = (k: CardAlertKind) => ({ outOfStock: t('在庫切れの見込み', 'Out of stock (expected)'), lowStock: t('在庫僅少', 'Low stock'), policyChanged: t('MD 方針の変更', 'MD policy change'), dateChanged: t('日程の変更', 'Date change'), overLimit: t('週の上限超え', 'Over the weekly limit'), imageExpired: t('商品画像のモデルの使用期限', 'Model rights expired on the image') })[k]
  // 候補の商品の印(差し替えた先が、別のアラートにならないように)
  const marks = (p: Product) => {
    const kind = alertKinds?.get(p.id)
    const over = (weekUse?.get(p.id) ?? 0) >= weeklyLimit(card)
    return (
      <span className={s.marks}>
        <LowStockBadge product={p} />
        {over && <Badge size="small" appearance="filled" color="severe">{t('週の上限', 'Weekly limit')}</Badge>}
        {kind && kind !== 'overLimit' && <Badge size="small" appearance="tint" color="danger">{kindName(kind)}</Badge>}
      </span>
    )
  }
  // 候補を押したら、すぐ入れ替える(シンプルな配信カードの引き出しと同じ)
  const pickProduct = (id: string, why: string) => {
    const p = poolProducts.find((x) => x.id === id) ?? stockCandidates?.find((c) => c.product.id === id)?.product
    if (p) onReplace?.(p, why)
  }
  // 残りの候補(このセクション)。商品の行から開いたときは、AI のおすすめのタブの最初に並べる(シンプルな配信カードの引き出しと同じ)
  const fallback = onSwapCandidate ? options.map((o) => ({ key: o.key, productId: o.product.id, reason: o.reason, onPick: () => onSwapCandidate(o.key, o.reason) })) : []

  return (
    // 下の配信カード(プレビュー・中ペイン)も見て触れるよう、背景を暗くしない
    <>
      <Dialog open modalType="non-modal" onOpenChange={(_, d) => !d.open && onClose()}>
        <ResizableSurface sizeKey="productAction" className={s.surface}>
          <DialogBody className={s.body}>
            {/* 題の行。つかむと動かせる(どのフロートとも同じ、ResizableSurface の floatMove) */}
            <div className={s.grab} data-float-title title={t('つかんで動かせます', 'Drag to move')}>
              {/* 題は短く: 詳しい情報では商品名だけ、入れ替えでは「○○を入れ替える」(2026-10-26 利用者の決め) */}
              <span className={s.grabTitle}>
                {alert
                  ? `${t('このアラートへの対応', 'Handle this alert')}${product ? ` — ${product.name}` : ''}`
                  : product && view === 'swap'
                    ? t(`${product.name} を入れ替える`, `Replace ${product.name}`)
                    : (product?.name ?? t('商品', 'Product'))}
              </span>
              {productUrl(product) && <OpenLink url={productUrl(product)} label={t('商品ページ', 'Product page')} />}
              {canSwap && view === 'detail' && (
                <Button size="small" appearance="primary" icon={<ArrowSwapRegular />} onClick={() => setView('swap')}>
                  {t('入れ替える', 'Replace')}
                </Button>
              )}
              <Button appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={onClose} />
            </div>

            {/* アラートの札から開いたとき: アラートの内容と、アラートの種類ごとの操作 */}
            {alert && (
              <div className={s.alert}>
                <span className={s.alertText}>
                  <span>
                    <strong>{kindName(alert.kind)}</strong>
                    {`: ${alert.label}`}
                  </span>
                  <span className={s.alertDetail}>
                    {alert.detail}
                    {product && stockAlert && t(` ・ いまの在庫 ${num(product.stock)}`, ` · Stock now ${num(product.stock)}`)}
                  </span>
                  {imageAlert && <span className={s.alertDetail}>{t('この配信で使う画像を、期限のない(まだ切れない)画像に替えるか、商品を入れ替えてください', 'Switch to an image without this expiry, or replace the product')}</span>}
                  {!stockAlert && !imageAlert && <span className={s.alertDetail}>{t('この変更は、確かめて「対応済み」にするものです(記録を残すため、アラートの画面で行います)', 'This change needs to be checked and marked as handled (done on the Alerts screen, where it is recorded).')}</span>}
                </span>
                <span className={s.others}>
                  {stockAlert && onPostpone && (
                    <Button size="small" icon={<CalendarArrowRightRegular />} onClick={onPostpone}>
                      {t('配信日を変える', 'Change the send date')}
                    </Button>
                  )}
                  {!overLimit && !imageAlert && onOpenAlerts && (
                    <Button size="small" appearance={stockAlert ? 'subtle' : 'primary'} icon={<OpenRegular />} onClick={onOpenAlerts}>
                      {t('アラートの画面で詳しく', 'Open in Alerts')}
                    </Button>
                  )}
                </span>
              </div>
            )}

            {slotAction && (
              <div className={s.alert} style={{ backgroundColor: tokens.colorBrandBackground2, borderColor: tokens.colorBrandStroke2 }}>
                {slotAction.backLabel && (
                  <Button size="small" appearance="subtle" icon={<ArrowLeftRegular />} onClick={onClose}>
                    {slotAction.backLabel}
                  </Button>
                )}
                <span className={s.alertText}>{slotAction.note ?? t('プレビューで選んでいる枠と見比べています(選んだ部品のペインにも並べています)', 'Comparing with the slot selected in the preview (also shown side by side in the part pane)')}</span>
                <Button size="small" appearance="primary" icon={<ArrowSwapRegular />} onClick={slotAction.run}>
                  {slotAction.label}
                </Button>
              </div>
            )}

            {product && view === 'swap' && (
              // 入れ替え: 同じフロートの中で、入れ替えの部品に切り替える(部品のペインには飛ばない。2026-10-26 利用者と決めた)
              <div className={s.pane}>
                <span>
                  <Button size="small" appearance="subtle" icon={<ArrowLeftRegular />} onClick={() => setView('detail')}>
                    {t('詳しい情報に戻る', 'Back to details')}
                  </Button>
                </span>
                {/* いまの商品を、候補の行と同じ並びで 1 行(見比べられるように) */}
                <div className={s.now}>
                  <span className={s.nowLabel}>{t('いま', 'Now')}</span>
                  <ProductLine product={product} />
                </div>
                {renderSwap ? (
                  // シンプルな配信カード: どの入口でも同じ引き出し(simple/ProductSwap)を、そのまま使う
                  renderSwap(() => setView('detail'), onClose)
                ) : (
                  // 詳しい画面・アラート: 同じ形の、選び直す枠(ProductChooser)。押すと、すぐ入れ替える
                  <ProductChooser
                    title={t(`「${product.name}」を入れ替える`, `Replace "${product.name}"`)}
                    frame={{ kind: 'panel', bare: true }}
                    card={aiCard()}
                    angle={angle}
                    current={product}
                    products={poolProducts}
                    inCard={poolProducts.filter((p) => inCard.has(p.id))}
                    why={swapWhy}
                    candidates={stockCandidates}
                    // アラートから開いたときは、在庫の見込みを確かめた候補から AI が選ぶ(残りの候補は先に出さない)。
                    // 商品の行から開いたときは、AI を呼ばずに、まず残りの候補を出す(シンプルな配信カードの引き出しと同じ)
                    fallback={stockAlert ? [] : fallback}
                    onPick={pickProduct}
                    marks={marks}
                  />
                )}
              </div>
            )}

            {product && view === 'detail' && (
              // 詳しい情報(いまの商品)。左の欄はやめ、横幅はこちらに回す
              <div className={s.pane}>
                {/* この配信で使う画像(X64)。商品のマスタの画像は変えない */}
                {onImage && (
                  <div className={s.imageBox}>
                    <ImageThumb src={productImage(product, image)} alt={product.name} width={56} height={70} />
                    <span className={s.imageText}>
                      <span className={s.sectionHead}>
                        {delivery?.variant ? t(`${delivery.variant} 案で使う画像`, `Image for variant ${delivery.variant}`) : t('この配信で使う画像', 'Image for this delivery')}
                        {delivery?.variant && (
                          <Badge size="small" appearance="filled" color="brand">
                            {t(`${delivery.variant} 案だけ`, `Variant ${delivery.variant} only`)}
                          </Badge>
                        )}
                        {image && !delivery?.variant && (
                          <Badge size="small" appearance="tint" color="brand">
                            {t('この配信で選んだ画像', 'Chosen for this delivery')}
                          </Badge>
                        )}
                      </span>
                      <span className={s.caption}>
                        {delivery?.variant
                          ? t(`${delivery.variant} 案だけに使う画像です。ほかの案は変わりません(A 案と同じ画像なら、A 案に合わせます)`, `Used only in variant ${delivery.variant}; other variants are unchanged (same as A means it follows A).`)
                          : image
                            ? t('商品のマスタの画像は変えていません(ほかの配信は元のまま)', 'The product master image is unchanged (other deliveries keep it).')
                            : t('いまは商品のマスタの画像。強みが伝わる画像に、この配信だけ替えられます', 'Uses the product master image. You can change it for this delivery only.')}
                      </span>
                      <Button size="small" icon={<ImageEditRegular />} onClick={() => setPicking(true)}>
                        {t('商品ページから画像を選ぶ…', 'Choose an image from the product page…')}
                      </Button>
                    </span>
                  </div>
                )}
                <ProductDetail key={product.id} product={product} />
              </div>
            )}
          </DialogBody>
        </ResizableSurface>
      </Dialog>
      {picking && product && onImage && (
        <ProductImagePicker
          product={product}
          current={image}
          delivery={delivery ?? {}}
          onPick={(url, source) => {
            onImage(url, source)
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  )
}
