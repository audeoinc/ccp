// 試す → 確定(2026-10-26 利用者と決めた。開発へのリクエスト fa294e76)。
// 入れ替え・AI の候補は、押すとプレビューにだけ仮に当てはめ(本物の値は変えない。自動保存も走らない)、上の帯の「確定」で初めて採用する。
// 「やめる」・閉じると元のまま。別の候補を押せば試し直せる。Enter で確定、Esc でやめる。
// 試している途中で別の部品を選ぶ・カードを閉じるときは、1 回だけ「確定しますか」と聞く(settlePendingTrial)
import { useEffect, useRef, useState } from 'react'
import { confirmDialog } from './confirm'
import { tr } from './i18n'

/** 試している候補 */
export interface Trial {
  /** 候補の鍵(同じ候補を押し直したかを見る) */
  key: string
  /** いまの値の名前(帯の左) */
  from: string
  /** 試している値の名前(帯の右) */
  to: string
  /** プレビューに仮に当てはめる */
  preview: () => void
  /** 仮に当てはめたのを消す(元に戻す) */
  unpreview: () => void
  /** 採用する(本物の値を変える) */
  apply: () => void
}

// ---- 画面全体で、いま試している候補(1 つだけ)。別の部品を選ぶ・閉じるときに確かめるため
type Pending = { trial: Trial; clear: () => void; owner: object }
let pending: Pending | null = null
// フックの中から変えるときは、この関数を通す(フックの中でモジュールの変数を書き換えない)
const setPending = (p: Pending | null) => {
  pending = p
}
const pendingNow = () => pending

/**
 * 試している候補があれば、確定するかを 1 回だけ聞く(別の部品を選ぶ・カードを閉じる前に呼ぶ)。
 * はい = 確定、いいえ = やめる(元のまま)。どちらでも、そのまま続けてよい
 */
export async function settlePendingTrial(): Promise<'applied' | 'cancelled' | null> {
  const p = pending
  if (!p) return null
  const yes = await confirmDialog(tr(`試している「${p.trial.to}」を確定しますか?(確定しないと、元の「${p.trial.from}」のままです)`, `Apply "${p.trial.to}" that you are trying? (If not, "${p.trial.from}" stays.)`), { okLabel: tr('確定', 'Apply') })
  // 聞いている間に、帯の側で確定・やめるを押していたら、何もしない
  if (pending !== p) return null
  p.clear()
  if (yes) p.trial.apply()
  else p.trial.unpreview()
  return yes ? 'applied' : 'cancelled'
}

/** 試している候補があるか(別の部品を選ぶ前に、聞くかどうか) */
export const hasPendingTrial = () => pending !== null

/** 試す・確定・やめるの状態。帯(bar)を、候補の一覧の上に置く */
export function useTrial() {
  const [trial, setTrial] = useState<Trial | null>(null)
  const ref = useRef<Trial | null>(null)
  // 画面全体の「試している候補」が、この一覧のものか(描くたびに関数が変わるので、印で見分ける)
  const [owner] = useState(() => ({}))
  const clear = () => {
    ref.current = null
    setTrial(null)
    if (pendingNow()?.owner === owner) setPending(null)
  }
  const tryIt = (next: Trial) => {
    // 同じ候補をもう一度押したら、確定する(押し直しで採用できるように)
    if (ref.current?.key === next.key) return confirm()
    // ほかの一覧で試していた候補は、やめたことにする(仮の当てはめを 2 つ重ねない)
    const other = pendingNow()
    if (other && other.owner !== owner) {
      other.trial.unpreview()
      other.clear()
    }
    // この一覧で前に試していた候補の当てはめを消してから、次を当てはめる
    ref.current?.unpreview()
    ref.current = next
    setTrial(next)
    next.preview()
    setPending({ trial: next, clear, owner })
  }
  const confirm = () => {
    const t = ref.current
    if (!t) return
    clear()
    t.apply()
  }
  const cancel = () => {
    const t = ref.current
    if (!t) return
    clear()
    t.unpreview()
  }
  // 部品が消えるとき(パネルを閉じた・カードを閉じた)は、やめたことにする(仮の当てはめを残さない)
  const cancelRef = useRef(cancel)
  useEffect(() => {
    cancelRef.current = cancel
  })
  useEffect(() => () => cancelRef.current(), [])
  return { trial, tryIt, confirm, cancel }
}

