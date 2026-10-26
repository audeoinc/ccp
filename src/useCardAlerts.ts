// 配信カードのアラートへの対応と、商品の差し替え(上の帯・プレビューの商品の枠・商品情報の行・商品のフロートから)。
// 差し替えは配信カードの state(items・candidates)の中で置き換え、確定は保存のとき。差し替えた理由は、保存で配信のメモに残す(alertNotes)。
// 状態と保存は配信カード(CardDetail)の 1 か所のまま。ここは、その state を受け取って直すだけ(整理 第3段 ①)
import { useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { SwapRender } from './ProductActionFloat'
import { tr } from './i18n'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import { SOURCE_MANUAL, swapNote, type Candidate, type Item } from './items'
import { confirmDialog } from './confirm'
import { CARD_ALERT_ORDER, type CardAlert } from './cardAlerts'
import type { FloatAction } from './simple/editor'

export interface CardAlertsDeps {
  /** この配信のアラート */
  alerts: CardAlert[]
  items: Item[]
  setItems: Dispatch<SetStateAction<Item[]>>
  candidates: Candidate[]
  setCandidates: Dispatch<SetStateAction<Candidate[]>>
  productById: Map<string, Product>
  card?: DeliveryCard
  draft?: { card: DeliveryCard }
  setAlertNotes: Dispatch<SetStateAction<string[]>>
  /** 配信カードの窓(延期のとき、配信日時の欄を探す) */
  surfaceRef: RefObject<HTMLDivElement | null>
  onOpenAlerts?: (productId?: string) => void
  /** 開いてから内容を変えたか(押したときに読む) */
  hasChanges: () => boolean
}

export function useCardAlerts({ alerts, items, setItems, candidates, setCandidates, productById, card, draft, setAlertNotes, surfaceRef, onOpenAlerts, hasChanges }: CardAlertsDeps) {
  const [actAlert, setActAlert] = useState<CardAlert | null>(null)
  // 商品の行(中の「選定済み」・右の商品情報)から開いた、商品の対応のフロートの行(X54。アラートから開いたときは actAlert)
  const [productOpen, setProductOpen] = useState<string | null>(null)
  // シンプルな配信カード(SU1)で、プレビューの枠を選んでから一覧の商品を押したときの、その枠への操作
  const [slotAction, setSlotAction] = useState<FloatAction | null>(null)
  // シンプルな配信カードの、フロートの「入れ替える」(画面の入れ替えの引き出しを開く。SU9)
  const [floatSwap, setFloatSwap] = useState<{ key: string; render: SwapRender } | null>(null)
  // 商品ごとの、いちばん強いアラート(商品の枠の印・商品情報のラベルに使う)
  const alertByProduct = new Map<string, CardAlert>()
  // 差し替えなどでこの配信から外した商品のアラートは、保存の前でも出さない(保存すると、アラートは計算し直される)
  const liveAlerts = alerts.filter((a) => !a.productId || items.some((i) => i.productId === a.productId))
  for (const k of CARD_ALERT_ORDER.slice().reverse()) for (const a of liveAlerts) if (a.kind === k && a.productId) alertByProduct.set(a.productId, a)
  const itemAlertKinds = new Map(items.filter((i) => alertByProduct.has(i.productId)).map((i) => [i.key, alertByProduct.get(i.productId)!.kind] as const))
  const openAlertFor = (productId: string) => {
    const a = alertByProduct.get(productId)
    if (a) {
      setProductOpen(null)
      setActAlert(a)
    }
  }
  // アラートへの対応で使う配信(保存した配信か、作業画面から開いた、まだ保存していない案)
  const alertCard = card ?? draft?.card
  const replaceForAlert = (alert: CardAlert, to: Product, reason = '') => {
    const from = productById.get(alert.productId ?? '')
    // 保存では、行の商品 ID は書き換えない(並び・理由だけを直す)ので、差し替えた枠は行 ID を外して、新しい行として保存する(元の行は消える)
    setItems((prev) => prev.map((i) => (i.productId === alert.productId ? { ...i, rowId: undefined, imageUrl: undefined, imageSource: undefined, productId: to.id, reason: tr(`${alert.label} の代わり(アラートへの対応)`, `Replaces ${alert.label} (alert)`), source: SOURCE_MANUAL } : i)))
    setAlertNotes((prev) => [...prev, swapNote(from?.name ?? alert.label, to.name, { detail: alert.detail, why: reason })])
    setActAlert(null)
  }
  // 商品のフロートの「ほかの候補から選ぶ」(X47): 選定済みの商品と、残りの候補を入れ替える(中ペインの「選ぶ」と同じく、外した商品は候補に戻す)。
  // どちらの行も行 ID のまま状態(選定 / 候補)だけが変わるので、保存で商品 ID を書き換えずに済む。確定は保存のとき
  const swapWithCandidate = (itemKey: string, candKey: string, reason: string) => {
    const it = items.find((i) => i.key === itemKey)
    const c = candidates.find((x) => x.key === candKey)
    if (!it || !c) return
    const from = productById.get(it.productId)
    const to = productById.get(c.productId)
    setItems((prev) => prev.map((i) => (i.key === itemKey ? { key: c.key, rowId: c.rowId, productId: c.productId, reason: c.reason, source: c.source } : i)))
    setCandidates((prev) => [{ ...it, section: c.section }, ...prev.filter((x) => x.key !== candKey)])
    setAlertNotes((prev) => [...prev, swapNote(from?.name ?? '', to?.name ?? '', { why: reason })])
  }
  // 商品のフロートで、この配信で使う画像を替える(X64。url が空なら、商品のマスタの画像に戻す)。確定は保存のとき
  const setItemImage = (itemKey: string, url: string, source: string) => {
    setItems((prev) => prev.map((i) => (i.key === itemKey ? (url ? { ...i, imageUrl: url, imageSource: source } : { ...i, imageUrl: undefined, imageSource: undefined }) : i)))
  }
  // 商品の対応のフロート(X54)で、AI の案・検索で選んだ商品に置き換える(アラートからのときは replaceForAlert)。
  // 保存では行の商品 ID を書き換えないので、置き換えた枠は行 ID を外して、新しい行として保存する
  const replaceItemWith = (itemKey: string, to: Product, reason: string) => {
    const it = items.find((i) => i.key === itemKey)
    if (!it) return
    const from = productById.get(it.productId)
    const why = reason.trim()
    setItems((prev) => prev.map((i) => (i.key === itemKey ? { ...i, rowId: undefined, imageUrl: undefined, imageSource: undefined, productId: to.id, reason: why || tr(`${from?.name ?? ''} の代わり(人が選んだ)`, `Replaces ${from?.name ?? ''} (chosen by hand)`), source: SOURCE_MANUAL } : i)))
    setAlertNotes((prev) => [...prev, swapNote(from?.name ?? '', to.name, { why })])
  }
  // 商品 ID → いちばん強いアラートの種類(中ペインの選定済みの行と、商品情報の行の札)
  const productAlertKinds = new Map([...alertByProduct].map(([id, a]) => [id, a.kind] as const))
  const postponeForAlert = () => {
    setActAlert(null)
    // 左の配信日時の欄へ移って、光らせる(延期も、ここで直して保存する)
    window.setTimeout(() => {
      const input = surfaceRef.current?.querySelector<HTMLInputElement>('input[type="datetime-local"]')
      input?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      input?.focus()
    }, 50)
  }
  const openAlertsScreen = async (productId?: string) => {
    // 変更の有無は、配信カードの state の changed で見る(ref を読む isDirty は、描画の中で渡す関数から呼べないため)
    if (hasChanges() && !(await confirmDialog(tr('保存していない変更があります。破棄して、アラートの画面を開きますか?', 'You have unsaved changes. Discard them and open the Alerts screen?')))) return
    setActAlert(null)
    onOpenAlerts?.(productId)
  }
  return { actAlert, setActAlert, productOpen, setProductOpen, slotAction, setSlotAction, floatSwap, setFloatSwap, liveAlerts, itemAlertKinds, openAlertFor, alertCard, replaceForAlert, swapWithCandidate, setItemImage, replaceItemWith, productAlertKinds, postponeForAlert, openAlertsScreen }
}
