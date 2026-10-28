// 制作の工程(X86 の ①。FEATURE_FLAGS の prod.steps・prod.result)。制作のシンプルな画面で使う、段の決め方と、段を進める操作(ボタンは StepAction.tsx)。
// 段は詳しい制作のページ(ProductionPage の工程の帯)と同じ: ① 制作に渡す(企画)→ ② 受け取る(制作)→ ③ 制作する(制作)→ ④ 仕上がりの確認(企画)→ ⑤ 配信のしくみに送る(企画)。
// シンプルでは、題の行に「自分の番のときだけ」青いボタンを出し(2026-10-28 利用者)、段の道のりと、だれの番でも押せるボタンは左のバーの「工程」に置く。
// ① の「制作に渡す」は、配信カードの「渡すもの」で行う(詳しい制作のページを消す段で、配信カードの中だけで済むようにする)
import { useState } from 'react'
import type { DeliveryCard } from '../models/deliveryCards'
import type { ProductionRequest } from '../models/productionRequests'
import { ProductionService } from '../data/production'
import { confirmDialog } from '../confirm'
import { canGoProduction } from '../productionGate'
import { weekKeyOf } from '../weekLock'
import { tr, when } from '../i18n'

export type StepKey = 'request' | 'receive' | 'make' | 'check' | 'send'
/** 段を進めるのはだれか(企画の担当 / 制作の担当) */
export type StepSide = 'planner' | 'production'

export interface StepInfo {
  key: StepKey
  name: string
  side: StepSide
  /** 担当の名前(空なら役割の名前) */
  who: string
  /** 済んだ段の、だれがいつ・ひとことなど */
  info?: string
  skipped?: boolean
}

export interface FlowActor {
  id: string
  name: string
}

/**
 * 工程の状態と、段を進める操作。サーバーの返事を待ってから読み直す(onChanged)。
 * html は「配信のしくみに送る」で渡す HTML(制作した HTML があればそれ、なければ企画の見本)
 */
export function useProductionFlow({ card, live, actor, html, variantHtml, onChanged }: { card: DeliveryCard; live?: ProductionRequest; actor: FlowActor; html: () => string; variantHtml?: string; onChanged: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const approved = canGoProduction(card)
  const status = live?.status
  // いまの段(詳しい制作のページと同じ数え方。-1 = 承認の前・0 = 渡す前 … 5 = 送った)
  const current = !approved ? -1 : !live ? 0 : status === 'requested' ? 1 : status === 'in_progress' ? 2 : status === 'done' ? 3 : status === 'checked' ? 4 : 5
  // 近道(制作を通さずに送った)は ② ③ を、確認を作る前に送った版は ④ を「飛ばした」にする
  const skipped = status === 'sent' && !live?.received_at && !live?.done_at
  const checkSkipped = status === 'sent' && !skipped && !live?.checked_at
  const weekStart = card.scheduled_at ? weekKeyOf(new Date(card.scheduled_at)) : undefined
  const owner = live?.production_owner ?? card.production_owner ?? ''

  const steps: StepInfo[] = [
    { key: 'request', name: tr('制作に渡す', 'Hand off to production'), side: 'planner', who: card.owner ?? '', info: live?.requested_by_name ? `${live.requested_by_name} ${when(live.requested_at)}` : undefined },
    { key: 'receive', name: tr('受け取る', 'Receive'), side: 'production', who: owner, info: live?.received_by_name ? `${live.received_by_name} ${when(live.received_at)}` : undefined, skipped },
    {
      key: 'make',
      name: tr('制作する', 'Produce'),
      side: 'production',
      who: owner,
      info: live?.done_by_name
        ? [`${live.done_by_name} ${when(live.done_at)}`, live.done_note, live.done_link].filter(Boolean).join(' — ')
        : live?.revision_note
          ? tr(`直してほしい(${live.revision_by_name ?? ''} ${when(live.revision_at)}): ${live.revision_note}`, `Fix requested (${live.revision_by_name ?? ''} ${when(live.revision_at)}): ${live.revision_note}`)
          : undefined,
      skipped,
    },
    { key: 'check', name: tr('仕上がりの確認', 'Check the result'), side: 'planner', who: card.owner ?? '', info: live?.checked_by_name ? `${live.checked_by_name} ${when(live.checked_at)}` : undefined, skipped: skipped || checkSkipped },
    { key: 'send', name: tr('配信のしくみに送る', 'Send to delivery system'), side: 'planner', who: card.owner ?? '', info: live?.sent_by_name ? tr(`${live.sent_by_name} ${when(live.sent_at)}(送り先は、まだ仮)`, `${live.sent_by_name} ${when(live.sent_at)} (placeholder destination)`) : undefined },
  ]
  const now = current >= 0 && current < steps.length ? steps[current] : undefined
  // 自分の番か: その段の担当が自分(担当が決まっていなければ、だれでも)。担当は名前で持っている
  const isMine = (st?: StepInfo) => !!st && !!actor.id && (!st.who || st.who === actor.name)

  const run = async (f: () => Promise<{ success: boolean; error?: { message: string }; data?: unknown }>, done?: string) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const r = await f()
      if (!r.success) throw new Error(r.error?.message ?? tr('うまくいきませんでした', 'Something went wrong'))
      const message = (r.data as { message?: string } | undefined)?.message
      if (done || message) setNotice(message ?? done ?? null)
      await onChanged()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  const input = { actor, week_start: weekStart }
  const act = {
    receive: () => live && run(() => ProductionService.receive(live.id, input), tr('受け取りました', 'Received')),
    done: (note: string, link: string) => live && run(() => ProductionService.done(live.id, { ...input, note, link }), tr('制作が終わりました', 'Marked as done')),
    check: () => live && run(() => ProductionService.check(live.id, input), tr('仕上がりを確認しました', 'Checked the result')),
    revise: (note: string) => (live ? run(() => ProductionService.revise(live.id, { ...input, note }), tr('制作に戻しました', 'Sent back to production')) : Promise.resolve(false)),
    send: async () => {
      if (!live || !(await confirmDialog(tr('配信のしくみに送ります。よろしいですか?', 'Send to the delivery system?')))) return
      void run(() => ProductionService.sendRequest(live.id, { ...input, html: html(), variant_html: variantHtml }), tr('送りました(送り先は、まだ仮です)', 'Sent (placeholder destination)'))
    },
    /** いちばん新しく終えた段を、まだ終えていない状態に戻す(渡した段なら、取り下げる) */
    undo: async () => {
      if (!live) return
      const first = current - 1 === 0
      if (!(await confirmDialog(first ? tr('渡したのを取り下げます。よろしいですか?', 'Withdraw the handoff?') : tr(`「${steps[current - 1]?.name}」をやり直します。よろしいですか?`, `Redo "${steps[current - 1]?.name}"?`)))) return
      void run(() => ProductionService.undo(live.id, input), first ? tr('渡したのを取り下げました', 'Withdrew the handoff') : tr('1 つ前の段に戻しました', 'Went back one step'))
    },
  }
  return { busy, error, notice, setNotice, setError, approved, current, steps, now, isMine, act, canUndo: !!live && current >= 1 && current <= 5 }
}

export type ProductionFlow = ReturnType<typeof useProductionFlow>

