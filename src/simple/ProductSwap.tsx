import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { ArrowSwapRegular, ChatRegular, SparkleRegular } from '@fluentui/react-icons'
import { Candidates } from '../Candidates'
import { ChooseDrawer, ChoosePanel, type ChooseTab } from '../ChoosePanel'
import { ImageThumb } from '../ImageThumb'
import { productImage } from '../images'
import { yen } from '../items'
import { productMarket } from '../market'
import { sectionIndexAt, sectionsOf } from '../templates'
import { tr, useT } from '../i18n'
import type { Product } from '../models/products'
import { partKey } from './parts'
import { PartAiChat } from './PartAiChat'
import { askProductPick, type PartAnswer, type PartIdea, type PartTurn } from './partAi'
import type { SimpleEditor } from './editor'

/*
 * 商品の入れ替えの引き出し(SU9)。シンプルな配信カードでは、入口(プレビューの ⇄・右クリック・選んだ部品のペイン・真ん中の「載せた商品」の行・
 * 右の商品情報の行・商品のフロート)は違っても、行き先はこの 1 つにする(利用者の指摘 2026-10-24: 商品だけ入れ替え方が分からなかった)。
 * 中身はメイン画像の「入れ替える」と同じ形(AI のおすすめ / AI に頼む / すべての商品)。
 */

const useStyles = makeStyles({
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' },
  ideaRow: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: '8px', alignItems: 'center', minWidth: 0 },
  name: { fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  pickRow: { display: 'grid', rowGap: '2px', padding: '6px 8px', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', minWidth: 0, ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
})

export interface Picks {
  key: string
  ideas: PartIdea[]
  busy: boolean
  error?: string
}

/**
 * 「選び直す」の最初のタブ(AI のおすすめ)の共通の形。メイン画像と商品の枠で使う。並べ方(画像の格子・商品の行)は children で渡す。
 * 案がまだなく、はじめの候補(hasFallback)もなければ、開いたときに 1 回だけ AI に頼む
 */
export function AiPicks({ hint, picks, hasFallback, onAsk, children }: { hint: string; picks?: Picks; hasFallback: boolean; onAsk: () => void; children: ReactNode }) {
  const t = useT()
  const s = useStyles()
  const busy = !!picks?.busy
  const any = picks ? picks.ideas.length > 0 : hasFallback
  const asked = useRef(false)
  useEffect(() => {
    if (asked.current || picks || hasFallback) return
    asked.current = true
    // 描画の中で親の状態を変えないよう、次の番に回す
    void Promise.resolve().then(onAsk)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 開いたときの 1 回だけ
  }, [])
  return (
    <>
      <span className={s.caption}>{hint}</span>
      {busy ? <Spinner size="tiny" label={t('AI が選んでいます…', 'AI is choosing…')} /> : any ? children : picks?.error && <span className={s.caption}>{picks.error}</span>}
      <span className={s.row}>
        <Button size="small" icon={<SparkleRegular />} disabled={busy} onClick={onAsk}>
          {any ? t('ほかのおすすめを挙げてもらう', 'Suggest others') : t('AI におすすめを挙げてもらう', 'Ask AI for picks')}
        </Button>
      </span>
    </>
  )
}

/** 案の商品の 1 行(写真・名前・コード・価格・在庫) */
export function ProductLine({ product: p }: { product?: Product }) {
  const t = useT()
  const s = useStyles()
  return p ? (
    <span className={s.ideaRow}>
      <ImageThumb src={productImage(p)} alt={p.name} width={36} height={44} />
      <span style={{ display: 'grid', minWidth: 0 }}>
        <span className={s.name}>{p.name}</span>
        <span className={s.meta}>{`${p.product_code ?? ''} ・ ${yen(p.price, productMarket(p))} ・ ${t(`在庫 ${p.stock ?? '-'}`, `Stock ${p.stock ?? '-'}`)}`}</span>
      </span>
    </span>
  ) : null
}

/** どの入口で開いているか(開くのは 1 か所だけ。pane = 選んだ部品のペインの箱の真下 / list = 真ん中の「載せた商品」の行 / info = 右の商品情報の行) */
export type SwapAt = { itemKey: string; at: 'pane' | 'list' | 'info' }

interface Props {
  editor: SimpleEditor
  itemKey: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 部品ごとの AI とのやり取り(選んだ部品のペインの「AI に頼む」と同じ会話を続ける) */
  chats: Record<string, PartTurn[]>
  setChat: (key: string, f: (prev: PartTurn[]) => PartTurn[]) => void
  /** 入れ替えたあと(候補と入れ替えると、行の鍵が候補の鍵に変わる) */
  onDone?: (newKey: string) => void
  /** false = 開くボタンは行の側にあるので、枠だけを出す */
  trigger?: boolean
}

/** 商品の入れ替えの引き出し。trigger のときは「入れ替える」のボタンと、その真下から引き出す枠 */
export function ProductSwap({ editor: e, itemKey, open, onOpenChange, chats, setChat, onDone, trigger = true }: Props) {
  const t = useT()
  const s = useStyles()
  const byId = new Map(e.products.map((p) => [p.id, p]))
  const key = partKey({ kind: 'product', itemKey })
  const [picks, setPicks] = useState<Picks | null>(null)
  const it = e.items.find((i) => i.key === itemKey)
  if (!it) return null
  const current = byId.get(it.productId)
  const sections = sectionsOf(e.template)
  // 同じセクションの、AI がはじめに挙げた残りの候補(AI のおすすめがまだないときに出す)
  const cands = e.candidates.filter((c) => c.section === sectionIndexAt(sections, e.items.indexOf(it)))
  const inCard = () => e.items.flatMap((i) => byId.get(i.productId) ?? [])
  const recommend = async () => {
    setPicks({ key, ideas: [], busy: true })
    try {
      const r: PartAnswer = await askProductPick({
        card: e.aiCard(),
        angle: e.form.copyAngle,
        current,
        products: e.poolProducts,
        inCard: inCard(),
        request: tr('この枠の商品の代わりになる、この配信に合う商品を 3〜4 点おすすめしてください。', 'Recommend 3 or 4 products that could replace this one and fit the delivery.'),
        history: [],
      })
      setPicks({ key, ideas: r.ideas, busy: false, error: r.ideas.length ? undefined : r.reply || tr('おすすめが見つかりませんでした', 'No recommendations found') })
    } catch (err) {
      setPicks({ key, ideas: [], busy: false, error: err instanceof Error ? err.message : String(err) })
    }
  }
  const swapTo = (productId: string, why: string) => {
    e.replaceItem(it.key, productId, why)
    onOpenChange(false)
    onDone?.(it.key)
  }
  const swapWith = (candKey: string, why: string) => {
    e.swapWithCandidate(it.key, candKey, why)
    onOpenChange(false)
    onDone?.(candKey)
  }
  const tabs: ChooseTab<string>[] = [
    {
      value: 'recommend',
      label: t('AI のおすすめ', 'AI picks'),
      icon: <SparkleRegular />,
      content: (
        <AiPicks hint={t('この枠の代わりになりそうな商品を、AI が挙げます。押すと入れ替わります', 'AI suggests products to replace this one. Click one to swap')} picks={picks ?? undefined} hasFallback={cands.length > 0} onAsk={() => void recommend()}>
          {picks
            ? picks.ideas.map((i) => (
                <button key={i.value} type="button" className={s.pickRow} title={i.why} disabled={e.saving} onClick={() => swapTo(i.value, i.why)}>
                  <ProductLine product={byId.get(i.value)} />
                  {i.why && <span className={s.caption}>{i.why}</span>}
                </button>
              ))
            : cands.map((c) => (
                <button key={c.key} type="button" className={s.pickRow} title={c.reason} disabled={e.saving} onClick={() => swapWith(c.key, c.reason ?? '')}>
                  <ProductLine product={byId.get(c.productId)} />
                  {c.reason && <span className={s.caption}>{c.reason}</span>}
                </button>
              ))}
        </AiPicks>
      ),
    },
    {
      value: 'ask',
      label: t('AI に頼む', 'Ask AI'),
      icon: <ChatRegular />,
      content: (
        <PartAiChat
          key={key}
          kind="product"
          label={t('この枠の商品', 'This product')}
          turns={chats[key] ?? []}
          setTurns={(f) => setChat(key, f)}
          placeholder={t('例: 2 万円以下のアウターで、在庫の多いもの', 'e.g. Outerwear under $150 with plenty of stock')}
          ask={(request, history) => askProductPick({ card: e.aiCard(), angle: e.form.copyAngle, current, products: e.poolProducts, inCard: inCard(), request, history })}
          renderIdea={(idea) => <ProductLine product={byId.get(idea.value)} />}
          isCurrent={(idea) => e.items.some((i) => i.productId === idea.value)}
          onPreview={(idea) => e.setAiPreview(idea ? { item: { key: it.key, productId: idea.value } } : null)}
          onAdopt={(idea) => {
            e.setAiPreview(null)
            swapTo(idea.value, idea.why)
          }}
        />
      ),
    },
    {
      value: 'all',
      label: t('すべての商品', 'All products'),
      content: (
        <Candidates
          products={e.poolProducts}
          usedIds={new Set(e.items.map((i) => i.productId))}
          onAdd={() => undefined}
          onPick={(id) => swapTo(id, '')}
          pickHint={t('押すと、この枠の商品と入れ替わります', 'Click to swap it into this slot')}
        />
      ),
    },
  ]
  const title = current ? t(`「${current.name}」を入れ替える`, `Replace "${current.name}"`) : t('この枠の商品を入れ替える', 'Replace this product')
  if (!trigger) return open ? <ChoosePanel key={key} title={title} tabs={tabs} onClose={() => onOpenChange(false)} /> : null
  return <ChooseDrawer key={key} open={open} onOpenChange={onOpenChange} label={t('入れ替える', 'Replace')} icon={<ArrowSwapRegular />} disabled={e.saving} title={title} tabs={tabs} />
}
