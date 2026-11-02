// シンプルな制作の画面(X86)の、部品のペインの「直す」。文言・メイン画像・商品・リンク先を直し、企画の値に戻す。
// 直しは、どれも試す → 確定(プレビューに仮に当てはめ、上の帯の「確定」で保存する。配信カードと同じ。2026-10-30 利用者: 要素を直すのも MVP)。
// 写しの直し方(setText など)・選ぶ部品(HeroPicker・ProductPicker)・AI(partAi)は、詳しい制作のページ・配信カードのものを使い回す
import { useMemo, useState } from 'react'
import { Badge, Button, Input, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { ArrowResetRegular, ArrowSwapRegular } from '@fluentui/react-icons'
import type { Product } from '../models/products'
import type { HeroImage } from '../models/heroImages'
import type { DeliveryCard } from '../models/deliveryCards'
import { AutoTextarea } from '../AutoTextarea'
import { HeroUploadDialog } from '../HeroUploadDialog'
import { HeroPicker, ProductPicker } from '../ProductionInfoPane'
import { PartAiChat } from '../simple/PartAiChat'
import { TextAiPanel } from '../simple/TextAiPanel'
import { askHeroPick, askPartRewrite, askProductPick, type PartTurn } from '../simple/partAi'
import { aiCardOfSaved } from '../bulkDraft'
import { getText, linkRows, setHero, setLink, setProducts, setText, type Snapshot, type TextRow } from '../productionSnapshot'
import { heroImage, productImage } from '../images'
import { cardMarket, heroMarket, productMarket } from '../market'
import { myName } from '../history'
import { typo } from '../typo'
import { useT } from '../i18n'
import type { PartRef } from '../simple/parts'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '10px', paddingTop: '10px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  head: { ...typo.heading },
  field: { display: 'grid', rowGap: '4px' },
  label: { ...typo.label },
  // 企画の値(直したときだけ。戻すの横)
  was: { display: 'flex', alignItems: 'flex-start', columnGap: '6px', padding: '4px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3, fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  wasValue: { flexGrow: 1, minWidth: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  changed: { display: 'inline-block', marginLeft: '6px', padding: '0 6px', borderRadius: tokens.borderRadiusCircular, backgroundColor: tokens.colorPaletteDarkOrangeBackground2, color: tokens.colorPaletteDarkOrangeForeground2, fontSize: '10px', fontWeight: tokens.fontWeightSemibold },
  row: { display: 'flex', alignItems: 'center', columnGap: '6px' },
  thumb: { width: '40px', height: '40px', objectFit: 'contain', flexShrink: 0, borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3 },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  idea: { display: 'flex', alignItems: 'center', columnGap: '8px', minWidth: 0 },
})

interface Props {
  part: PartRef
  /** いまの写し(A 案。直していれば直したもの) */
  current: Snapshot
  /** いま試している写し(欄には、試している値を出す。試していなければ null) */
  trying: Snapshot | null
  /** 企画から渡された写し(「企画から変えた」の印と、戻す先) */
  original: Snapshot
  /** その部品の文の行(textRows のうち、選んだ部品のもの) */
  rows: TextRow[]
  /** 選んだ商品の、並びの中の位置(商品の部品のとき) */
  productIndex?: number
  /** リンク先を直せる場所の鍵(メイン画像・ボタン) */
  linkKey?: string | null
  card: DeliveryCard
  products: Product[]
  heroes: HeroImage[]
  /** AI に頼めるか(prod.ai) */
  aiOn: boolean
  /** 試す(プレビューに仮に当てはめ、上の帯の「確定」で保存する)。key が同じなら、押し直しで確定 */
  onTry: (next: Snapshot, label: { key: string; from: string; to: string }) => void
  /** 文言・リンク先を打ったとき(そのまま入れ、画面の側が自動で保存する。計画と同じ) */
  onEdit: (next: Snapshot) => void
  /** 文の AI の案を、プレビューにだけ写す(null で戻す。確定は AI の欄の中で。計画の TextAiPanel と同じ) */
  onPreview: (next: Snapshot | null) => void
  /** すぐ入れる(企画の値に戻す) */
  onCommit: (next: Snapshot) => void
  /** 部品ごとの AI のやり取り(部品を選び直しても残るよう、画面の側が持つ) */
  turns: PartTurn[]
  setTurns: (f: (prev: PartTurn[]) => PartTurn[]) => void
}

export function ProductionPartEdit({ part, current, trying, original, rows, productIndex, linkKey, card, products, heroes, aiOn, onTry, onEdit, onPreview, onCommit, turns, setTurns }: Props) {
  const s = useStyles()
  const t = useT()
  const [uploading, setUploading] = useState(false)
  const market = cardMarket(current.card.country ?? '')
  const poolProducts = useMemo(() => (market ? products.filter((p) => productMarket(p) === market) : products), [products, market])
  const poolHeroes = useMemo(() => (market ? heroes.filter((h) => heroMarket(h) === market) : heroes), [heroes, market])
  const aiCard = () => aiCardOfSaved({ ...card, ...current.card } as DeliveryCard)
  const angle = card.copy_angle ?? ''

  /** 企画の値と違えば、その値と「戻す」 */
  const wasRow = (was: string, now: string, back: () => Snapshot) =>
    was !== now && (
      <span className={s.was}>
        <span className={s.wasValue}>{t(`企画の値: ${was || '(空)'}`, `Plan value: ${was || '(empty)'}`)}</span>
        <Tooltip content={t('企画から渡された値に戻します', 'Revert to the value handed off from the plan')} relationship="label">
          <Button size="small" appearance="subtle" icon={<ArrowResetRegular />} onClick={() => onCommit(back())}>
            {t('戻す', 'Revert')}
          </Button>
        </Tooltip>
      </span>
    )

  const textField = (r: TextRow) => {
    const now = getText(current, r.field)
    const was = getText(original, r.field)
    return (
      <div key={r.id} className={s.field}>
        <span className={s.label}>
          {r.label}
          {was !== now && <Badge size="small" appearance="tint" color="warning">{t('企画から変更', 'Changed')}</Badge>}
        </span>
        {/* 打てばそのまま入り、画面の側が自動で保存する(計画と同じ。試す → 確定は AI と入れ替えだけ) */}
        <TextEdit value={getText(trying ?? current, r.field)} onChange={(v) => onEdit(setText(current, r.field, v))} />
        {wasRow(was, now, () => setText(current, r.field, was))}
        {/* 文の AI(案 / 指示して直す)。計画の部品のペインと同じ部品(どの文の部品も同じ。Plan と Production の差の 47) */}
        {aiOn && (
          <TextAiPanel
            key={r.id}
            kind={part.kind}
            label={r.label}
            value={now}
            ask={(request, count, history) =>
              askPartRewrite({
                card: aiCard(),
                angle,
                part: { kind: part.kind, label: r.label, current: now },
                context: { subject: current.card.subject ?? '', preheader: current.card.preheader ?? '', headline: current.card.headline ?? '', copy: current.card.copy ?? '', pushTitle: current.card.push_title ?? '', pushBody: current.card.push_body ?? '' },
                request,
                history,
                count,
              })
            }
            onPreview={(v) => onPreview(v === null ? null : setText(current, r.field, v))}
            onAdopt={(idea) => {
              onPreview(null)
              onCommit(setText(current, r.field, idea.value))
            }}
          />
        )}
      </div>
    )
  }

  const hero = part.kind === 'hero' && (
    <div className={s.field}>
      <span className={s.label}>
        {t('メイン画像', 'Main image')}
        {(current.hero?.id ?? '') !== (original.hero?.id ?? '') && <Badge size="small" appearance="tint" color="warning">{t('企画から変更', 'Changed')}</Badge>}
      </span>
      <span className={s.row}>
        {current.hero && <img className={s.thumb} src={heroImage(current.hero) ?? ''} alt="" />}
        <span className={s.note} style={{ flexGrow: 1 }}>{current.hero?.name ?? t('(なし)', '(none)')}</span>
        <HeroPicker heroes={poolHeroes} onPick={(h) => onTry(setHero(current, h), { key: `hero:${h.id}`, from: current.hero?.name ?? '', to: h.name })} onUpload={() => setUploading(true)} />
      </span>
      {(current.hero?.id ?? '') !== (original.hero?.id ?? '') && wasRow(original.hero?.name ?? '', current.hero?.name ?? '', () => setHero(current, original.hero ?? null))}
      {aiOn && (
        <PartAiChat
          kind="hero"
          label={t('メイン画像', 'Main image')}
          turns={turns}
          setTurns={setTurns}
          ask={(request, history) => askHeroPick({ card: aiCard(), angle, current: current.hero ?? undefined, heroes: poolHeroes, productNames: current.products.map((p) => p.name), request, history })}
          renderIdea={(idea) => {
            const h = heroes.find((x) => x.id === idea.value)
            return (
              <span className={s.idea}>
                {h && <img className={s.thumb} src={heroImage(h) ?? ''} alt="" />}
                {h?.name ?? idea.value}
              </span>
            )
          }}
          isCurrent={(idea) => idea.value === current.hero?.id}
          onPreview={() => undefined}
          onAdopt={() => undefined}
          onTry={(idea) => {
            const h = heroes.find((x) => x.id === idea.value)
            if (h) onTry(setHero(current, h), { key: `hero:${h.id}`, from: current.hero?.name ?? '', to: h.name })
          }}
        />
      )}
    </div>
  )

  const nowProduct = productIndex !== undefined ? current.products.find((p) => p.id === current.productIds[productIndex]) : undefined
  const wasProduct = productIndex !== undefined ? original.products.find((p) => p.id === original.productIds[productIndex]) : undefined
  const swapTo = (id: string) => {
    if (productIndex === undefined) return
    const p = products.find((x) => x.id === id)
    if (!p) return
    // 空いた枠は、並びの長さより後ろのこともある(そこまで空で埋めてから入れる)
    const ids = [...current.productIds]
    while (ids.length <= productIndex) ids.push('')
    ids[productIndex] = id
    onTry(setProducts(current, ids, products), { key: `product:${productIndex}:${id}`, from: nowProduct?.name ?? '', to: p.name })
  }
  const product = productIndex !== undefined && (
    <div className={s.field}>
      <span className={s.label}>
        {t('商品', 'Product')}
        {nowProduct?.id !== wasProduct?.id && <Badge size="small" appearance="tint" color="warning">{t('企画から変更', 'Changed')}</Badge>}
      </span>
      <span className={s.row}>
        {/* 空いた枠(P14 の足す)は「入れる」。どちらも試す → 確定 */}
        <span className={s.note} style={{ flexGrow: 1 }}>{nowProduct ? t('ほかの商品に入れ替える', 'Replace with another product') : t('この枠に商品を入れる', 'Put a product in this slot')}</span>
        <ProductPicker trigger={<Button size="small" appearance="subtle" icon={<ArrowSwapRegular />}>{nowProduct ? t('入れ替える', 'Replace') : t('入れる', 'Add')}</Button>} products={poolProducts} onPick={swapTo} />
      </span>
      {wasProduct && nowProduct?.id !== wasProduct.id && wasRow(wasProduct.name, nowProduct?.name ?? '', () => setProducts(current, current.productIds.map((x, i) => (i === productIndex ? wasProduct.id : x)), [...products, wasProduct]))}
      {aiOn && (
        <PartAiChat
          kind="product"
          label={t('商品', 'Product')}
          turns={turns}
          setTurns={setTurns}
          ask={(request, history) => askProductPick({ card: aiCard(), angle, current: nowProduct, products: poolProducts, inCard: current.products.filter((p) => current.productIds.includes(p.id)), request, history })}
          renderIdea={(idea) => {
            const p = products.find((x) => x.id === idea.value)
            return (
              <span className={s.idea}>
                {p && <img className={s.thumb} src={productImage(p) ?? ''} alt="" />}
                {p?.name ?? idea.value}
              </span>
            )
          }}
          isCurrent={(idea) => idea.value === nowProduct?.id}
          onPreview={() => undefined}
          onAdopt={() => undefined}
          onTry={(idea) => swapTo(idea.value)}
        />
      )}
    </div>
  )

  // リンク先(計測用のパラメーターを付ける前の URL を直す)
  const linkNow = linkKey ? (linkRows(current).find((r) => r.slotKey === linkKey)?.base ?? '') : ''
  const linkWas = linkKey ? (linkRows(original).find((r) => r.slotKey === linkKey)?.base ?? '') : ''
  const link = linkKey && linkRows(current).some((r) => r.slotKey === linkKey) && (
    <div className={s.field}>
      <span className={s.label}>
        {t('リンク先(計測用のパラメーターは自動で付きます)', 'Link (tracking parameters are added automatically)')}
        {linkNow !== linkWas && <Badge size="small" appearance="tint" color="warning">{t('企画から変更', 'Changed')}</Badge>}
      </span>
      <LinkEdit value={trying ? (linkRows(trying).find((r) => r.slotKey === linkKey)?.base ?? '') : linkNow} onChange={(v) => onEdit(setLink(current, linkKey, v))} />
      {wasRow(linkWas, linkNow, () => setLink(current, linkKey, linkWas))}
    </div>
  )

  if (!rows.length && !hero && !product && !link) return null
  return (
    <div className={s.root}>
      <span className={s.head}>{t('直す', 'Edit')}</span>
      {rows.map(textField)}
      {hero}
      {product}
      {link}
      <span className={s.note}>{t('文言・リンク先は打てばそのまま入り、自動で保存します(↶ で戻せます)。画像・商品の入れ替えと AI の案は、プレビューで試してから、上の帯の「確定」で入ります。配信カードは変わらず、承認もやり直しません。', 'Text and links apply as you type and save automatically (undo with ↶). Image/product swaps and AI ideas are tried in the preview and applied with "Apply" in the bar above. The delivery card does not change; no re-approval.')}</span>
      {uploading && (
        <HeroUploadDialog
          market={market}
          cardId={current.card.id}
          me={myName()}
          onClose={() => setUploading(false)}
          onDone={(h) => {
            setUploading(false)
            onTry(setHero(current, h), { key: `hero:${h.id}`, from: current.hero?.name ?? '', to: h.name })
          }}
        />
      )}
    </div>
  )
}

/** 文の欄(AI の案を試している間は、その値を出す) */
function TextEdit({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <AutoTextarea heightKey="ProductionPartEdit.text" size="small" rows={1} value={value} onChange={(_, d) => onChange(d.value)} />
}

/** リンク先の欄(打ち終えたら入れる。打ちかけの URL でプレビューのリンクを崩さないように) */
function LinkEdit({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null && draft.trim() && draft !== value) onChange(draft.trim())
    setDraft(null)
  }
  return <Input size="small" value={draft ?? value} placeholder="https://" onChange={(_, d) => setDraft(d.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
}
