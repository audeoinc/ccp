// 配信カードの保存の流れ(整理 第3段 ④)。何をするかを決める planSave と、決めたことを決まった順に行う runSave に分ける。
// 順番に意味がある(配信を書いてから商品の行・週・承認・履歴。週を戻せなかったら、承認の依頼は古いものにしない など)ので、
// scripts/check-save.mjs が、確定した週・承認済みの配信・新規作成などの例で、決めることと順番を確かめる(npm run verify)。
// 画面・サーバーには触らない(読み書きは、呼ぶ側が io で渡す)
import { STATUS_REVIEW } from './cardForm'

/** 保存のあとにどうするか: 閉じる / 開いたまま続ける / 次の配信を開く */
export type SaveAfter = 'close' | 'stay' | 'next'

export interface SaveInput {
  /** 新規作成(まだ保存していない配信) */
  isNew: boolean
  /** 保存済みの配信のステータス(新規作成なら undefined) */
  savedStatus?: string
  /** 入力欄のステータス(空なら undefined) */
  formStatus?: string
  /** 確定した週の配信を変えた理由(確定した週でなければ undefined) */
  reason?: string
  /** 開いたとき、承認済み(かそれより後)だったか */
  approvedBefore: boolean
  /** 開いた時点から、中身を変えたか */
  contentChanged: boolean
}

export interface SavePlan {
  /** 保存するステータス */
  status?: string
  /** 承認済みの配信の中身を変えたので、承認をやり直す(承認待ちに戻す) */
  revoke: boolean
  /** 確定した週を、レビュー中に戻す(理由を残す) */
  reopen: boolean
  /** いまの承認の依頼を古いものにする */
  resetApproval: boolean
  /** 承認の履歴に残すこと(残さないなら null) */
  event: 'reopen' | 'revoke' | 'status' | null
}

/**
 * 保存で何をするかを決める。確定した週の変更(reason あり)と、承認済みの配信の中身を変えたときは、もう一度承認を受けるので「承認待ち」。
 * 人がステータスを変えて保存したときは、その値のまま(承認のやり直しにしない)
 */
export function planSave(i: SaveInput): SavePlan {
  const reopen = i.reason !== undefined
  const revoke = !reopen && i.approvedBefore && i.formStatus === i.savedStatus && i.contentChanged
  const status = reopen || revoke ? STATUS_REVIEW : i.formStatus
  const resetApproval = !i.isNew && (reopen || revoke)
  const event = !i.isNew && (reopen || i.savedStatus !== status) ? (reopen ? 'reopen' : revoke ? 'revoke' : 'status') : null
  return { status, revoke, reopen, resetApproval, event }
}

/** 保存の読み書き(呼ぶ側が、サーバーの窓口とつなぐ)。失敗は例外で知らせる(そこで止める) */
export interface SaveIO {
  /** 配信カードを書く(新規作成なら作る)。配信の id を返す */
  writeCard: (status: string | undefined) => Promise<string>
  /** 商品の行を、開いた時点との差分で書く(開いた時点の行を読めていないときは null。消してしまわないように書かない) */
  syncItems: ((cardId: string) => Promise<void>) | null
  /** 新規作成の配信を作った(まとめて作る作業画面に、その案を保存済みと知らせる) */
  created: (cardId: string) => void
  /** 確定した週を、レビュー中に戻す */
  reopenWeeks: () => Promise<void>
  /** 確定した週の変更の理由を、配信のメモに残す */
  noteReason: (cardId: string) => Promise<void>
  /** いまの承認の依頼を古いものにする */
  resetApproval: (cardId: string) => Promise<void>
  /** 承認の履歴に残す */
  logEvent: (cardId: string, action: 'reopen' | 'revoke' | 'status') => Promise<void>
  /** 商品を差し替えた理由を、配信のメモに残す(なければ何もしない) */
  saveAlertNotes: (cardId: string) => Promise<void>
  /** 画面の表を読み直す */
  reload: () => Promise<void>
}

/** 決めたことを、決まった順に行う。保存した配信の id を返す */
export async function runSave(plan: SavePlan, isNew: boolean, io: SaveIO): Promise<string> {
  const cardId = await io.writeCard(plan.status)
  if (io.syncItems) await io.syncItems(cardId)
  if (isNew) io.created(cardId)
  if (plan.reopen) {
    await io.reopenWeeks()
    await io.noteReason(cardId)
  }
  // 中身が変わったので、いまの承認の依頼は古いものにする(依頼し直してもらう。U4)
  if (plan.resetApproval) await io.resetApproval(cardId)
  // 承認の履歴(W6): 保存済みの配信のステータスが変わったら、誰が・いつ・何から何にしたかを残す
  if (plan.event) await io.logEvent(cardId, plan.event)
  await io.saveAlertNotes(cardId)
  await io.reload()
  return cardId
}
