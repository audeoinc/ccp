import { useEffect, useRef, useState } from 'react'
import { Button, Dialog, DialogBody, DialogContent, DialogSurface, DialogTitle, MessageBar, MessageBarBody, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { ArrowMoveRegular, CalendarArrowRightRegular, DismissRegular, OpenRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { CardAlert } from './cardAlerts'
import type { StockModel } from './alerts'
import { replacementCandidates, suggestReplacements, type ReplacementCandidate } from './alertActions'
import { productImage } from './images'
import { priceText, tr, useT } from './i18n'
import { WEEKLY_PRODUCT_LIMIT } from './reviewChecks'
import { AiIcon } from './AiMark'

const useStyles = makeStyles({
  surface: { width: 'min(760px, 94vw)' },
  // 題名の行をつかんで動かす(下のプレビューを見ながら選べるように)
  // 題名の行の全体をつかめるようにする(アイコンの近くだけだと、つかめると気づきにくいため)
  grab: { display: 'flex', alignItems: 'center', columnGap: '8px', width: '100%', cursor: 'move', userSelect: 'none', touchAction: 'none' },
  grabHint: { marginLeft: 'auto', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightRegular, color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  grabIcon: { color: tokens.colorNeutralForeground3 },
  body: { display: 'grid', rowGap: '12px' },
  head: { display: 'flex', alignItems: 'center', columnGap: '12px' },
  headImg: { width: '56px', height: '56px', objectFit: 'contain', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3, flexShrink: 0 },
  detail: { color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase300 },
  sub: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  picks: { display: 'grid', rowGap: '8px' },
  pick: { display: 'grid', gridTemplateColumns: '56px minmax(0, 1fr) auto', columnGap: '12px', alignItems: 'center', padding: '8px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}` },
  pickImg: { width: '56px', height: '56px', objectFit: 'contain', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3 },
  pickName: { fontWeight: tokens.fontWeightSemibold },
  pickMeta: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  pickWhy: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  others: { display: 'flex', flexWrap: 'wrap', columnGap: '8px', rowGap: '6px', paddingTop: '8px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
})

interface Props {
  alert: CardAlert
  /** アラートの商品(在庫・方針。日程の変更では、ない) */
  product?: Product
  /** 保存済みの配信(国・ID)。差し替えの候補の決め方に使う */
  card: DeliveryCard
  /** いまの配信日時(配信カードで書き換え中の値) */
  scheduledAt: string
  /** いまこの配信に載っている商品(候補から外す) */
  inCard: Set<string>
  products: Product[]
  model?: StockModel
  /** この週に、商品を載せる配信の数(週の上限超えのアラートで、上限に届いた商品を候補から除く) */
  weekUse?: Map<string, number>
  /** 差し替える(配信カードの中で置き換える。保存で確定) */
  onReplace: (to: Product) => void
  /** 配信日を変える(左の配信日時の欄へ) */
  onPostpone: () => void
  /** アラートの画面で詳しく見る */
  onOpenAlerts: () => void
  onClose: () => void
}

/**
 * 配信カードの中の「このアラートへの対応」。上の帯・プレビューの商品の枠・商品情報の行の、どこから押しても、これを開く。
 * 差し替えは、配信カードの中でその枠の商品を置き換えるだけ(保存で確定。保存しなければ元のまま)。
 * 配信カードは「直してから保存」の作りなので、裏で保存するアラートの画面の差し替えとは分ける(書きかけの内容と食い違わないように)
 */
export function CardAlertAction({ alert, product, card, scheduledAt, inCard, products, model, weekUse, onReplace, onPostpone, onOpenAlerts, onClose }: Props) {
  const s = useStyles()
  // つかんで動かした量(題名の行のドラッグ)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const t = useT()
  // 差し替えで直すアラート(在庫と、週の上限超え)。週の上限超えはアラートの画面にないので、「アラートの画面で詳しく」は出さない
  const overLimit = alert.kind === 'overLimit'
  const stock = alert.kind === 'outOfStock' || alert.kind === 'lowStock' || overLimit
  const kindName = { outOfStock: t('在庫切れの見込み', 'Out of stock (expected)'), lowStock: t('在庫僅少', 'Low stock'), policyChanged: t('MD 方針の変更', 'MD policy change'), dateChanged: t('日程の変更', 'Date change'), overLimit: t('週の上限超え', 'Over the weekly limit') }[alert.kind]
  const [picks, setPicks] = useState<{ c: ReplacementCandidate; reason: string }[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const market = card.country === 'US' ? 'US' : 'JP'
  const num = (v?: number) => Math.round(v ?? 0).toLocaleString()

  // 差し替えの候補を、開いたときに 1 回だけ AI に選ばせる(在庫・方針のアラートで、商品があるとき)
  useEffect(() => {
    if (!stock || !product || !model) return
    let alive = true
    const when = scheduledAt ? new Date(scheduledAt).toISOString() : (card.scheduled_at ?? new Date().toISOString())
    const candidates = replacementCandidates({ card, removed: product, products, model, inCard, when }).filter((c) => !overLimit || (weekUse?.get(c.product.id) ?? 0) < WEEKLY_PRODUCT_LIMIT)
    suggestReplacements({ card, removed: product, candidates, ...(overLimit ? { why: tr(`この週に ${WEEKLY_PRODUCT_LIMIT} 本を超えて載せている`, `featured in more than ${WEEKLY_PRODUCT_LIMIT} deliveries this week`) } : {}) })
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

  return (
    // 下の配信カード(プレビュー・商品情報)も見て触れるよう、背景を暗くしない(non-modal)。題名の行をつかんで動かせる
    <Dialog open modalType="non-modal" onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface className={s.surface} style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>
        <DialogBody>
          <DialogTitle action={<Button appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={onClose} />}>
            <span
              className={s.grab}
              title={t('つかんで動かせます', 'Drag to move')}
              onPointerDown={(e) => {
                drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y }
                e.currentTarget.setPointerCapture(e.pointerId)
              }}
              onPointerMove={(e) => {
                const d = drag.current
                if (d) setPos({ x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy })
              }}
              onPointerUp={() => {
                drag.current = null
              }}
            >
              <ArrowMoveRegular className={s.grabIcon} />
              {t('このアラートへの対応', 'Handle this alert')}
              <span className={s.grabHint}>{t('つかんで動かせます', 'Drag to move')}</span>
            </span>
          </DialogTitle>
          <DialogContent className={s.body}>
            <div className={s.head}>
              {product && productImage(product) && <img className={s.headImg} src={productImage(product)} alt="" draggable={false} />}
              <div>
                <div>
                  <strong>{kindName}</strong>
                  {`: ${alert.label}`}
                </div>
                <div className={s.detail}>
                  {alert.detail}
                  {product && stock && t(` ・ いまの在庫 ${num(product.stock)}`, ` · Stock now ${num(product.stock)}`)}
                </div>
              </div>
            </div>

            {stock && product && (
              <>
                <span className={s.sub}>
                  <AiIcon size={14} /> {overLimit
                    ? t(`AI の差し替え候補(在庫のある、同じカテゴリで、この週にまだ ${WEEKLY_PRODUCT_LIMIT} 本載せていない商品)。「使う」で、この配信の中で置き換えます(保存で確定)`, `AI replacement ideas (in stock, same category, fewer than ${WEEKLY_PRODUCT_LIMIT} uses this week). "Use" swaps it in this delivery (saved when you save).`)
                    : t('AI の差し替え候補(在庫のある、同じカテゴリの商品)。「使う」で、この配信の中で置き換えます(保存で確定)', 'AI replacement ideas (in stock, same category). "Use" swaps it in this delivery (saved when you save).')}
                </span>
                {error && (
                  <MessageBar intent="error">
                    <MessageBarBody>{error}</MessageBarBody>
                  </MessageBar>
                )}
                {picks === null ? (
                  <Spinner size="small" label={t('AI が候補を選んでいます', 'AI is choosing candidates')} />
                ) : picks.length === 0 ? (
                  <span className={s.sub}>{t('条件に合う商品がありません。セクションのタブで、ほかの商品から選んでください', 'No matching products. Choose another product in the Sections tab.')}</span>
                ) : (
                  <div className={s.picks}>
                    {picks.map(({ c, reason }) => (
                      <div key={c.product.id} className={s.pick}>
                        <img className={s.pickImg} src={productImage(c.product)} alt="" draggable={false} />
                        <div>
                          <div className={s.pickName}>{c.product.name}</div>
                          <div className={s.pickMeta}>
                            {`${priceText(c.product.price, market)} ・ `}
                            {t(`いまの在庫 ${num(c.product.stock)}`, `Stock now ${num(c.product.stock)}`)}
                            {c.weeksLeft !== undefined && t(` ・ 配信日に ${c.weeksLeft.toFixed(1)} 週分`, ` · ${c.weeksLeft.toFixed(1)} wks on the day`)}
                          </div>
                          {reason && <div className={s.pickWhy}>{reason}</div>}
                        </div>
                        <Button appearance="primary" size="small" onClick={() => onReplace(c.product)}>
                          {t('使う', 'Use')}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {!stock && (
              <span className={s.sub}>
                {t('この変更は、確かめて「対応済み」にするものです(記録を残すため、アラートの画面で行います)', 'This change needs to be checked and marked as handled (done on the Alerts screen, where it is recorded).')}
              </span>
            )}

            <div className={s.others}>
              {stock && (
                <Button size="small" icon={<CalendarArrowRightRegular />} onClick={onPostpone}>
                  {t('配信日を変える', 'Change the send date')}
                </Button>
              )}
              {!overLimit && (
                <Button size="small" appearance={stock ? 'subtle' : 'primary'} icon={<OpenRegular />} onClick={onOpenAlerts}>
                  {t('アラートの画面で詳しく', 'Open in Alerts')}
                </Button>
              )}
            </div>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
