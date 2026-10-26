import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Button, Spinner, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ChatRegular, SparkleRegular } from '@fluentui/react-icons'
import { Candidates } from './Candidates'
import { ChooseDrawer, ChoosePanel, type ChooseTab } from './ChoosePanel'
import { ImageThumb } from './ImageThumb'
import { productImage } from './images'
import { yen } from './items'
import { productMarket } from './market'
import { stockCover, useProductData } from './useProductData'
import { tr, useT } from './i18n'
import type { AiCard } from './aiSelect'
import type { ReplacementCandidate } from './alertActions'
import type { Product } from './models/products'
import { PartAiChat } from './simple/PartAiChat'
import { askProductPick, type PartIdea, type PartTurn } from './simple/partAi'

/*
 * 商品を選び直す枠(2026-10-24 の整理)。シンプルな配信カードの入れ替えの引き出し(simple/ProductSwap)・
 * 商品のフロート(ProductActionFloat)・アラートへの対応(AlertActionPanel)で、同じ形にする:
 * 「AI のおすすめ / AI に頼む /(場所ごとのタブ)/ すべての商品」。AI に聞くのは askProductPick だけ
 * (差し替える理由 why と、頼みごと request の両方を渡せる。アラートからでも「AI に頼む」が使える)。
 */

const useStyles = makeStyles({
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' },
  ideaRow: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: '8px', alignItems: 'center', minWidth: 0 },
  name: { fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  pickRow: { display: 'grid', rowGap: '2px', padding: '6px 8px', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', minWidth: 0, ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  pickOn: { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: '-1px' },
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

/** 案の商品の 1 行(写真・名前・コード・価格・在庫。在庫の見込みを確かめた候補なら、配信日の週数と載せた回数も) */
export function ProductLine({ product: p, fact }: { product?: Product; fact?: ReplacementCandidate }) {
  const t = useT()
  const s = useStyles()
  // 在庫の持ち(詳しい情報の「在庫の持ち」と同じ計算。いまの商品と候補を見比べられるように。2026-10-26 利用者の決め)。売れていない・読めないときは出さない
  const { data } = useProductData(p?.product_code)
  const cover = data ? stockCover(data.weekly, p?.stock) : undefined
  return p ? (
    <span className={s.ideaRow}>
      <ImageThumb src={productImage(p)} alt={p.name} width={36} height={44} />
      <span style={{ display: 'grid', minWidth: 0 }}>
        <span className={s.name}>{p.name}</span>
        <span className={s.meta}>
          {`${p.product_code ?? ''} ・ ${yen(p.price, productMarket(p))} ・ ${t(`在庫 ${p.stock ?? '—'}`, `Stock ${p.stock ?? '—'}`)}`}
          {cover !== undefined && t(` ・ 在庫の持ち 約${cover}週`, ` · ~${cover} wk of stock`)}
        </span>
        {fact && (
          <span className={s.meta}>
            {fact.weeksLeft !== undefined && t(`配信日に ${fact.weeksLeft.toFixed(1)} 週分 ・ `, `${fact.weeksLeft.toFixed(1)} wks on the day · `)}
            {t(`載せた回数 今週 ${fact.thisWeek} ・ 前週 ${fact.lastWeek}`, `Featured: this wk ${fact.thisWeek} · last wk ${fact.lastWeek}`)}
          </span>
        )}
      </span>
    </span>
  ) : null
}

type Frame =
  /** 対象の真下のボタンから引き出す(シンプルな配信カード) */
  | { kind: 'drawer'; open: boolean; onOpenChange: (open: boolean) => void; label: ReactNode; icon?: ReactElement }
  /** 枠だけ(開くボタンは呼ぶ側。onClose がなければ × を出さない。bare = 枠と見出しも出さない) */
  | { kind: 'panel'; onClose?: () => void; bare?: boolean }

interface Props {
  title: ReactNode
  frame: Frame
  card: AiCard
  angle: string
  /** いまの商品(空いた枠なら、なし) */
  current?: Product
  /** 選べる商品(配信の国の市場のもの) */
  products: Product[]
  /** この配信に載せている商品(選ばせない) */
  inCard: Product[]
  /** 差し替える理由(アラートなど)。AI のおすすめにも、AI に頼むにも渡す */
  why?: string
  /** 在庫の見込みを確かめた候補(アラートからの差し替え)。あれば、AI はこの中から選ぶ */
  candidates?: ReplacementCandidate[]
  /** AI のおすすめの前に並べる、はじめの候補(シンプルな配信カードの、同じセクションの残りの候補) */
  fallback?: { key: string; productId: string; reason?: string; onPick: () => void }[]
  onPick: (productId: string, why: string) => void
  /** AI に頼む欄の案を、仮にプレビューに写す(null で戻す) */
  onPreview?: (productId: string | null) => void
  /** AI に頼む欄のやり取り(画面の側で持つなら渡す。なければ、この枠の中で持つ) */
  chat?: { turns: PartTurn[]; setTurns: (f: (prev: PartTurn[]) => PartTurn[]) => void }
  /** 「AI に頼む」と「すべての商品」の間に足すタブ(商品のフロートの「残りの候補」など) */
  extraTabs?: ChooseTab<string>[]
  defaultTab?: string
  disabled?: boolean
  /** すべての商品の行の印(残少・週の上限 など) */
  marks?: (p: Product) => ReactNode
  /** 選んでいる商品(印を付ける) */
  pickedId?: string
}

export function ProductChooser({ title, frame, card, angle, current, products, inCard, why, candidates, fallback = [], onPick, onPreview, chat, extraTabs = [], defaultTab, disabled, marks, pickedId }: Props) {
  const t = useT()
  const s = useStyles()
  const [picks, setPicks] = useState<Picks | null>(null)
  const [ownTurns, setOwnTurns] = useState<PartTurn[]>([])
  const turns = chat?.turns ?? ownTurns
  const setTurns = chat?.setTurns ?? ((f: (prev: PartTurn[]) => PartTurn[]) => setOwnTurns(f))
  const byId = new Map([...products, ...(candidates ?? []).map((c) => c.product)].map((p) => [p.id, p]))
  const facts = new Map((candidates ?? []).map((c) => [c.product.id, c]))
  const ask = (request: string, history: PartTurn[]) => askProductPick({ card, angle, current, products, inCard, request, history, why, candidates })
  const recommend = async () => {
    setPicks({ key: '', ideas: [], busy: true })
    try {
      const request = why
        ? tr(`いまの商品を、次の理由で入れ替えます: ${why}。代わりになる、この配信に合う商品を 3 点おすすめしてください。`, `Replacing the current product because: ${why}. Recommend 3 products that could replace it and fit the delivery.`)
        : tr('この枠の商品の代わりになる、この配信に合う商品を 3〜4 点おすすめしてください。', 'Recommend 3 or 4 products that could replace this one and fit the delivery.')
      const r = await ask(request, [])
      setPicks({ key: '', ideas: r.ideas, busy: false, error: r.ideas.length ? undefined : r.reply || tr('おすすめが見つかりませんでした', 'No recommendations found') })
    } catch (err) {
      setPicks({ key: '', ideas: [], busy: false, error: err instanceof Error ? err.message : String(err) })
    }
  }
  const row = (key: string, productId: string, why2: string | undefined, run: () => void) => (
    <button key={key} type="button" className={mergeClasses(s.pickRow, pickedId === productId && s.pickOn)} title={why2} disabled={disabled} onClick={run}>
      <ProductLine product={byId.get(productId)} fact={facts.get(productId)} />
      {why2 && <span className={s.caption}>{why2}</span>}
    </button>
  )
  const tabs: ChooseTab<string>[] = [
    {
      value: 'recommend',
      label: t('AI のおすすめ', 'AI picks'),
      icon: <SparkleRegular />,
      content: (
        <AiPicks
          hint={why ? t(`入れ替える理由(${why})に合わせて、AI が候補を挙げます。押すと選びます`, `AI suggests replacements for: ${why}. Click one to choose it`) : t('この枠の代わりになりそうな商品を、AI が挙げます。押すと選びます', 'AI suggests products to replace this one. Click one to choose it')}
          picks={picks ?? undefined}
          hasFallback={fallback.length > 0}
          onAsk={() => void recommend()}
        >
          {picks ? picks.ideas.map((i) => row(i.value, i.value, i.why, () => onPick(i.value, i.why))) : fallback.map((c) => row(c.key, c.productId, c.reason, c.onPick))}
        </AiPicks>
      ),
    },
    {
      value: 'ask',
      label: t('AI に頼む', 'Ask AI'),
      icon: <ChatRegular />,
      content: (
        <PartAiChat
          kind="product"
          label={t('この枠の商品', 'This product')}
          turns={turns}
          setTurns={setTurns}
          placeholder={t('例: 2 万円以下のアウターで、在庫の多いもの', 'e.g. Outerwear under $150 with plenty of stock')}
          ask={ask}
          renderIdea={(idea) => <ProductLine product={byId.get(idea.value)} fact={facts.get(idea.value)} />}
          isCurrent={(idea) => inCard.some((p) => p.id === idea.value)}
          onPreview={(idea) => onPreview?.(idea ? idea.value : null)}
          onAdopt={(idea) => {
            onPreview?.(null)
            onPick(idea.value, idea.why)
          }}
        />
      ),
    },
    ...extraTabs,
    {
      value: 'all',
      label: t('すべての商品', 'All products'),
      content: (
        <Candidates
          products={products}
          usedIds={new Set(inCard.map((p) => p.id))}
          onAdd={() => undefined}
          onPick={(id) => onPick(id, '')}
          pickedId={pickedId}
          marks={marks}
          pickHint={t('押すと選びます', 'Click to choose')}
        />
      ),
    },
  ]
  if (frame.kind === 'panel') return <ChoosePanel title={title} tabs={tabs} defaultTab={defaultTab} onClose={frame.onClose} bare={frame.bare} />
  return <ChooseDrawer open={frame.open} onOpenChange={frame.onOpenChange} label={frame.label} icon={frame.icon} disabled={disabled} title={title} tabs={tabs} defaultTab={defaultTab} />
}
