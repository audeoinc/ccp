import { useSyncExternalStore } from 'react'
import { ArrowSwapRegular } from '@fluentui/react-icons'
import { ProductChooser } from '../ProductChooser'
import { sectionIndexAt, sectionsOf } from '../templates'
import { useT } from '../i18n'
import { partKey } from './parts'
import { CANDIDATE_DETAIL } from './editor'
import type { PartTurn } from './partAi'
import type { SimpleEditor } from './editor'
import type { LiveStore } from './floatSwap'

/*
 * 商品の入れ替えの引き出し(SU9)。シンプルな配信カードでは、入口(プレビューの ⇄・右クリック・選んだ部品のペイン・真ん中の「載せた商品」の行・
 * 右の商品情報の行・商品のフロート)は違っても、行き先はこの 1 つにする(利用者の指摘 2026-10-24: 商品だけ入れ替え方が分からなかった)。
 * 中身は、商品を選び直す共通の枠(ProductChooser。商品のフロート・アラートへの対応と同じ形)
 */

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
  /** 枠と題・× を出さない(商品のフロートの中。フロートが題を持ち、戻るのは「← 詳しい情報に戻る」だけ。2026-10-26 利用者の決め) */
  bare?: boolean
}

/** 商品の入れ替えの引き出し。trigger のときは「入れ替える」のボタンと、その真下から引き出す枠 */
export function ProductSwap({ editor: e, itemKey, open, onOpenChange, chats, setChat, onDone, trigger = true, bare = false }: Props) {
  const t = useT()
  const key = partKey({ kind: 'product', itemKey })
  const it = e.items.find((i) => i.key === itemKey)
  if (!it || (!trigger && !open)) return null
  const byId = new Map(e.products.map((p) => [p.id, p]))
  const current = byId.get(it.productId)
  const sections = sectionsOf(e.template)
  // 同じセクションの、AI がはじめに挙げた残りの候補(AI のおすすめがまだないときに出す)
  const cands = e.candidates.filter((c) => c.section === sectionIndexAt(sections, e.items.indexOf(it)))
  const done = (newKey: string) => {
    onOpenChange(false)
    onDone?.(newKey)
  }
  return (
    <ProductChooser
      key={key}
      title={current ? t(`「${current.name}」を入れ替える`, `Replace "${current.name}"`) : t('この枠の商品を入れ替える', 'Replace this product')}
      frame={trigger ? { kind: 'drawer', open, onOpenChange, label: t('入れ替える', 'Replace'), icon: <ArrowSwapRegular /> } : { kind: 'panel', onClose: () => onOpenChange(false), bare }}
      card={e.aiCard()}
      angle={e.form.copyAngle}
      current={current}
      products={e.poolProducts}
      inCard={e.items.flatMap((i) => byId.get(i.productId) ?? [])}
      fallback={cands.map((c) => ({
        key: c.key,
        productId: c.productId,
        reason: c.reason,
        onPick: () => {
          e.swapWithCandidate(it.key, c.key, c.reason ?? '')
          done(c.key)
        },
      }))}
      onPick={(productId, why) => {
        e.replaceItem(it.key, productId, why)
        done(it.key)
      }}
      onPreview={(productId) => e.setAiPreview(productId ? { item: { key: it.key, productId } } : null)}
      // 候補の「詳しく」: フロートの中(bare)では、同じ枠の中でもう 1 段深く開く。部品のペイン・一覧の行では、商品のフロートを入れ替えのボタンつきで開く
      onDetail={
        bare
          ? undefined
          : (productId, pick) =>
              e.openProduct(`${CANDIDATE_DETAIL}${productId}`, {
                label: t('この商品と入れ替える', 'Replace with this product'),
                note: current ? t(`入れ替えの候補です。押すと「${current.name}」と入れ替えます`, `A replacement candidate. Click to replace "${current.name}"`) : t('入れ替えの候補です', 'A replacement candidate'),
                backLabel: t('候補に戻る', 'Back to candidates'),
                run: pick,
              })
      }
      chat={{ turns: chats[key] ?? [], setTurns: (f) => setChat(key, f) }}
      disabled={e.saving}
    />
  )
}

/** 商品のフロートの中に出す引き出し(画面の今の値は、入れ物から読む。作るのは floatSwap の useFloatSwap) */
export function FloatSwap({ store, itemKey, back, close }: { store: LiveStore; itemKey: string; back: () => void; close: () => void }) {
  const v = useSyncExternalStore(store.subscribe, store.get)
  return (
    <ProductSwap
      editor={v.editor}
      itemKey={itemKey}
      open
      onOpenChange={(o) => !o && back()}
      chats={v.chats}
      setChat={v.setChat}
      onDone={(k) => {
        close()
        v.onSwapped(itemKey, k)
      }}
      trigger={false}
      bare
    />
  )
}
