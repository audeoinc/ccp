import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Dialog, DialogBody, Field, MessageBar, MessageBarBody, Spinner, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ResizableSurface } from './ResizableSurface'
import { ArrowLeftRegular, ArrowMoveRegular, ArrowSwapRegular, CalendarArrowRightRegular, DismissRegular, ImageEditRegular, OpenRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { DeliveryProductSource as Source } from './models/deliveryProducts'
import type { CardAlert, CardAlertKind } from './cardAlerts'
import type { StockModel } from './alerts'
import { replacementCandidates, suggestReplacements, type ReplacementCandidate } from './alertActions'
import { ProductDetail } from './ProductDetail'
import { Candidates } from './Candidates'
import { LowStockBadge } from './ProductMarks'
import { AutoTextarea } from './AutoTextarea'
import { ImageThumb } from './ImageThumb'
import { productImage } from './images'
import { priceText, tr, useT } from './i18n'
import { OpenLink } from './LinkText'
import { productUrl } from './links'
import { productMarket } from './market'
import { weeklyLimit } from './weeklyLimit'
import { AiIcon } from './AiMark'
import { getUiScale } from './uiScale'
import { ProductImagePicker, type DeliveryGist } from './ProductImagePicker'

// 商品の対応のフロート(X54)。「このアラートへの対応」(X30)と「商品のフロート」(X47)を 1 つにしたもの。
// どこから開いても同じ形: 左に、差し替えの候補(AI の差し替え案・残りの候補・ほかの商品を探す)、右に、選んでいる商品の詳しい情報。
// アラートの札から開くと、上にアラートの内容とアラートごとの操作(配信日を変える など)。差し替えは配信カードの中で置き換え、保存で確定する

/** 残りの候補(中ペインの「残りの候補」と同じもの・同じ順番) */
export interface SwapOption {
  key: string
  product: Product
  reason: string
  source: Source
}

/** 右に出している商品(いまの商品か、候補のどれか) */
type Focus = { kind: 'current' } | { kind: 'cand'; key: string; product: Product } | { kind: 'ai'; product: Product; why: string } | { kind: 'search'; product: Product }

const useStyles = makeStyles({
  // 高さを中身に合わせると、右のタブ(売上・在庫 / 詳細 / SKU …)を替えるたびに高さが変わり、真ん中に置いたフロートの上端が動いた(X70)。
  // 高さを決めて、中身は左右の欄の中でスクロールさせる(つまみで変えた大きさを覚えていれば、そちらが勝つ)
  surface: { width: 'min(1040px, (96vw / var(--ui-zoom, 1)))', maxWidth: 'none', height: 'min(760px, calc(88vh / var(--ui-zoom, 1)))', maxHeight: 'calc(88vh / var(--ui-zoom, 1))', display: 'flex', flexDirection: 'column', padding: '14px 18px' },
  body: { display: 'flex', flexDirection: 'column', rowGap: '10px', minHeight: 0, flexGrow: 1 },
  // 題名の行の全体をつかんで動かす(プレビューを見ながら選べるように)
  grab: { display: 'flex', alignItems: 'center', columnGap: '8px', cursor: 'move', userSelect: 'none', touchAction: 'none' },
  grabTitle: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  grabHint: { marginLeft: 'auto', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  muted: { color: tokens.colorNeutralForeground3 },
  alert: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: '10px', rowGap: '6px', padding: '8px 12px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorPaletteDarkOrangeBackground1, border: `1px solid ${tokens.colorPaletteDarkOrangeBorder1}` },
  alertText: { display: 'grid', rowGap: '2px', flexGrow: 1, minWidth: 0 },
  alertDetail: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  cols: { display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) minmax(0, 1fr)', columnGap: '16px', minHeight: 0, flexGrow: 1 },
  left: { display: 'grid', alignContent: 'start', rowGap: '14px', overflowY: 'auto', minHeight: 0, paddingRight: '6px' },
  right: { display: 'grid', alignContent: 'start', rowGap: '10px', overflowY: 'auto', minHeight: 0, borderLeft: `1px solid ${tokens.colorNeutralStroke2}`, paddingLeft: '16px' },
  section: { display: 'grid', rowGap: '6px' },
  sectionHead: { display: 'flex', alignItems: 'center', columnGap: '6px', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  row: { display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr)', columnGap: '10px', alignItems: 'center', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  rowOn: { outline: `2px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  rowName: { fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowMeta: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  rowWhy: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  marks: { display: 'flex', flexWrap: 'wrap', gap: '4px' },
  rightHead: { display: 'flex', alignItems: 'center', columnGap: '8px', fontSize: tokens.fontSizeBase300 },
  swapBox: { display: 'grid', rowGap: '8px', paddingTop: '8px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  swapActions: { display: 'flex', justifyContent: 'flex-end', columnGap: '8px' },
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
  /** 残りの候補と入れ替える(行 ID のまま入れ替わる) */
  onSwapCandidate?: (candKey: string, reason: string) => void
  /** ほかの商品(AI の案・検索)に置き換える */
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
  slotAction?: { label: string; run: () => void }
  onClose: () => void
}

/** 商品の対応のフロート(X54) */
export function ProductActionFloat({ product, alert, card, scheduledAt, inCard, products, poolProducts, model, weekUse, alertKinds, options, image, delivery, onImage, onSwapCandidate, onReplace, onPostpone, onOpenAlerts, slotAction, onClose }: Props) {
  const s = useStyles()
  const t = useT()
  // つかんで動かした量
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const [focus, setFocus] = useState<Focus>({ kind: 'current' })
  const [reason, setReason] = useState('')
  const [picking, setPicking] = useState(false)

  // AI の差し替え案(在庫・週の上限のアラートから開いたとき。開いたときに 1 回だけ)
  const overLimit = alert?.kind === 'overLimit'
  const stockAlert = !!alert && (alert.kind === 'outOfStock' || alert.kind === 'lowStock' || overLimit)
  const [picks, setPicks] = useState<{ c: ReplacementCandidate; reason: string }[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!stockAlert || !product || !model || !card) return
    let alive = true
    const when = scheduledAt ? new Date(scheduledAt).toISOString() : (card.scheduled_at ?? new Date().toISOString())
    const candidates = replacementCandidates({ card, removed: product, products, model, inCard, when }).filter((c) => !overLimit || (weekUse?.get(c.product.id) ?? 0) < weeklyLimit(card))
    suggestReplacements({ card, removed: product, candidates, ...(overLimit ? { why: tr(`この週に ${weeklyLimit(card)} 本を超えて載せている`, `featured in more than ${weeklyLimit(card)} deliveries this week`) } : {}) })
      .then((r) => alive && setPicks(r))
      .catch((e: unknown) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : String(e))
        setPicks([])
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const kindName = (k: CardAlertKind) => ({ outOfStock: t('在庫切れの見込み', 'Out of stock (expected)'), lowStock: t('在庫僅少', 'Low stock'), policyChanged: t('MD 方針の変更', 'MD policy change'), dateChanged: t('日程の変更', 'Date change'), overLimit: t('週の上限超え', 'Over the weekly limit') })[k]
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
  const market = productMarket(product ?? poolProducts[0])
  const num = (v?: number) => Math.round(v ?? 0).toLocaleString()
  const row = (key: string, p: Product, on: boolean, onClick: () => void, why?: string, extra?: string) => (
    <button key={key} type="button" className={mergeClasses(s.row, on && s.rowOn)} onClick={onClick}>
      <ImageThumb src={productImage(p)} alt={p.name} width={40} height={52} />
      <span style={{ display: 'grid', rowGap: 2, minWidth: 0 }}>
        <span className={s.rowName}>{p.name}</span>
        <span className={s.rowMeta}>{`${p.product_code ?? ''} ・ ${priceText(p.price, market)} ・ ${t(`在庫 ${num(p.stock)}`, `Stock ${num(p.stock)}`)}${extra ? ` ・ ${extra}` : ''}`}</span>
        {why && <span className={s.rowWhy}>{why}</span>}
        {marks(p)}
      </span>
    </button>
  )
  const shown = focus.kind === 'current' ? product : focus.product
  const canSwap = focus.kind !== 'current' && (focus.kind === 'cand' ? !!onSwapCandidate : !!onReplace)
  const doSwap = () => {
    if (focus.kind === 'cand') onSwapCandidate?.(focus.key, reason)
    else if (focus.kind !== 'current') onReplace?.(focus.product, reason)
  }

  return (
    // 下の配信カード(プレビュー・中ペイン)も見て触れるよう、背景を暗くしない
    <>
      <Dialog open modalType="non-modal" onOpenChange={(_, d) => !d.open && onClose()}>
        <ResizableSurface sizeKey="productAction" className={s.surface} style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>
          <DialogBody className={s.body}>
            <div
              className={s.grab}
              title={t('つかんで動かせます', 'Drag to move')}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest('button')) return
                drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y }
                e.currentTarget.setPointerCapture(e.pointerId)
              }}
              onPointerMove={(e) => {
                const d = drag.current
                // 表示の大きさ(X60)を掛けた分、マウスの動きを中の大きさに直す
                if (d) setPos({ x: d.ox + (e.clientX - d.sx) / getUiScale(), y: d.oy + (e.clientY - d.sy) / getUiScale() })
              }}
              onPointerUp={() => {
                drag.current = null
              }}
            >
              <ArrowMoveRegular className={s.muted} />
              <span className={s.grabTitle}>{alert ? t('このアラートへの対応', 'Handle this alert') : t('商品の詳しい情報と差し替え', 'Product details and swap')}{product ? ` — ${product.name}` : ''}</span>
              {productUrl(product) && <OpenLink url={productUrl(product)} label={t('商品ページ', 'Product page')} />}
              <span className={s.grabHint}>{t('つかんで動かせます', 'Drag to move')}</span>
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
                  {!stockAlert && <span className={s.alertDetail}>{t('この変更は、確かめて「対応済み」にするものです(記録を残すため、アラートの画面で行います)', 'This change needs to be checked and marked as handled (done on the Alerts screen, where it is recorded).')}</span>}
                </span>
                <span className={s.others}>
                  {stockAlert && onPostpone && (
                    <Button size="small" icon={<CalendarArrowRightRegular />} onClick={onPostpone}>
                      {t('配信日を変える', 'Change the send date')}
                    </Button>
                  )}
                  {!overLimit && onOpenAlerts && (
                    <Button size="small" appearance={stockAlert ? 'subtle' : 'primary'} icon={<OpenRegular />} onClick={onOpenAlerts}>
                      {t('アラートの画面で詳しく', 'Open in Alerts')}
                    </Button>
                  )}
                </span>
              </div>
            )}

            {slotAction && (
              <div className={s.alert} style={{ backgroundColor: tokens.colorBrandBackground2, borderColor: tokens.colorBrandStroke2 }}>
                <span className={s.alertText}>{t('プレビューで選んでいる枠と見比べています(選んだ部品のペインにも並べています)', 'Comparing with the slot selected in the preview (also shown side by side in the part pane)')}</span>
                <Button size="small" appearance="primary" icon={<ArrowSwapRegular />} onClick={slotAction.run}>
                  {slotAction.label}
                </Button>
              </div>
            )}

            {product && (
              <div className={s.cols}>
                {/* 左: 差し替えの候補 */}
                <div className={s.left}>
                  {stockAlert && (
                    <div className={s.section}>
                      <span className={s.sectionHead}>
                        <AiIcon size={14} />
                        {t('AI の差し替え案', 'AI replacement ideas')}
                      </span>
                      <span className={s.caption}>
                        {overLimit
                          ? t(`在庫があり、同じカテゴリで、この週にまだ ${weeklyLimit(card)} 本載せていない商品から`, `In stock, same category, fewer than ${weeklyLimit(card)} uses this week`)
                          : t('在庫のある、同じカテゴリの商品から', 'In stock, same category')}
                      </span>
                      {error && (
                        <MessageBar intent="error">
                          <MessageBarBody>{error}</MessageBarBody>
                        </MessageBar>
                      )}
                      {picks === null ? (
                        <Spinner size="small" label={t('AI が候補を選んでいます', 'AI is choosing candidates')} />
                      ) : picks.length === 0 ? (
                        <span className={s.caption}>{t('条件に合う商品がありません。下の「ほかの商品を探す」から選んでください', 'No matching products. Search other products below.')}</span>
                      ) : (
                        picks.map(({ c, reason: why }) =>
                          row(`ai:${c.product.id}`, c.product, focus.kind === 'ai' && focus.product.id === c.product.id, () => setFocus({ kind: 'ai', product: c.product, why }), why, c.weeksLeft !== undefined ? t(`配信日に ${c.weeksLeft.toFixed(1)} 週分`, `${c.weeksLeft.toFixed(1)} wks on the day`) : undefined),
                        )
                      )}
                    </div>
                  )}
                  <div className={s.section}>
                    <span className={s.sectionHead}>
                      <ArrowSwapRegular />
                      {t(`残りの候補(${options.length})`, `Remaining candidates (${options.length})`)}
                    </span>
                    {options.length === 0 ? (
                      <span className={s.caption}>{t('このセクションの残りの候補はありません(中ペインの「AIで選ぶ」で案を出すと、ここに並びます)', 'No remaining candidates for this section (use "Select with AI" in the middle pane).')}</span>
                    ) : (
                      options.map((o) => row(`cand:${o.key}`, o.product, focus.kind === 'cand' && focus.key === o.key, () => setFocus({ kind: 'cand', key: o.key, product: o.product }), o.reason))
                    )}
                  </div>
                  <div className={s.section}>
                    <span className={s.sectionHead}>{t('ほかの商品を探す', 'Search other products')}</span>
                    <Candidates
                      products={poolProducts}
                      usedIds={inCard}
                      onAdd={() => undefined}
                      onPick={(id) => {
                        const p = poolProducts.find((x) => x.id === id)
                        if (p) setFocus({ kind: 'search', product: p })
                      }}
                      pickedId={focus.kind === 'search' ? focus.product.id : undefined}
                      marks={marks}
                    />
                  </div>
                </div>

                {/* 右: 選んでいる商品の詳しい情報(最初は、いまの商品) */}
                <div className={s.right}>
                  <div className={s.rightHead}>
                    {focus.kind === 'current' ? (
                      <Text weight="semibold">{t('いまの商品', 'Current product')}</Text>
                    ) : (
                      <>
                        <Button size="small" appearance="subtle" icon={<ArrowLeftRegular />} onClick={() => setFocus({ kind: 'current' })}>
                          {t('いまの商品に戻る', 'Back to current')}
                        </Button>
                        <Text weight="semibold">{t('候補', 'Candidate')}</Text>
                      </>
                    )}
                  </div>
                  {/* この配信で使う画像(X64)。いまの商品のときだけ。商品のマスタの画像は変えない */}
                  {focus.kind === 'current' && onImage && (
                    <div className={s.imageBox}>
                      <ImageThumb src={productImage(product, image)} alt={product.name} width={56} height={70} />
                      <span className={s.imageText}>
                        <span className={s.sectionHead}>
                          {t('この配信で使う画像', 'Image for this delivery')}
                          {image && (
                            <Badge size="small" appearance="tint" color="brand">
                              {t('この配信で選んだ画像', 'Chosen for this delivery')}
                            </Badge>
                          )}
                        </span>
                        <span className={s.caption}>{image ? t('商品のマスタの画像は変えていません(ほかの配信は元のまま)', 'The product master image is unchanged (other deliveries keep it).') : t('いまは商品のマスタの画像。強みが伝わる画像に、この配信だけ替えられます', 'Uses the product master image. You can change it for this delivery only.')}</span>
                        <Button size="small" icon={<ImageEditRegular />} onClick={() => setPicking(true)}>
                          {t('商品ページから画像を選ぶ…', 'Choose an image from the product page…')}
                        </Button>
                      </span>
                    </div>
                  )}
                  {shown && <ProductDetail key={shown.id} product={shown} />}
                  {canSwap && (
                    <div className={s.swapBox}>
                      <Field label={t('差し替えの理由(任意。配信のメモに残ります)', 'Reason for the swap (optional; kept in the delivery notes)')} size="small">
                        <AutoTextarea heightKey="ProductActionFloat.reason" size="small" value={reason} onChange={(_, d) => setReason(d.value)} />
                      </Field>
                      <div className={s.swapActions}>
                        <Button size="small" onClick={() => setFocus({ kind: 'current' })}>
                          {t('やめる', 'Cancel')}
                        </Button>
                        <Button size="small" appearance="primary" icon={<ArrowSwapRegular />} onClick={doSwap}>
                          {t(`「${product.name}」をこの商品に差し替える`, `Replace "${product.name}" with this`)}
                        </Button>
                      </div>
                      <span className={s.caption}>{t('この配信の中で置き換えます(保存で確定。保存しなければ元のまま)', 'Swaps it in this delivery (confirmed when you save).')}</span>
                    </div>
                  )}
                </div>
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
