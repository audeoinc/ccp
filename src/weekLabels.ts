// 週のレビューの、項目名・説明・履歴の文言。画面(確認の一覧・週の帯の履歴)と、週の資料(PDF。WeekReport)で同じ言葉にするため、1 か所に置く
import type { CheckKey } from './reviewChecks'
import { weeklyLimit } from './weeklyLimit'
import type { EventAction } from './data/events'
import type { tr } from './i18n'

type T = typeof tr

/** 確認の一覧の項目名 */
export const checkTitle = (t: T, k: CheckKey): string =>
  ({
    overLimit: t(`週の上限(${weeklyLimit()} 本。決まりがあれば、その値)を超えた商品`, `Products over the weekly limit (${weeklyLimit()}; a rule overrides it)`),
    pushAlign: t('メールとプッシュのテーマ違い', 'Email / push to align'),
    leadMissing: t('載っていない主力の商品', 'Lead items not featured'),
    repeat: t('テーマ・メイン画像の連続', 'Same main image or theme in a row'),
    openComments: t('未解決のやり取り', 'Open conversations'),
    openQuestions: t('未解決の質問', 'Open questions'),
    aiUnchecked: t('未確認の AI 下書き', 'Unchecked AI drafts'),
    approved: t('承認済みの配信', 'Approved deliveries'),
  })[k]

/** 確認の一覧の項目の説明(選んだときに出す) */
export const checkHint = (t: T, k: CheckKey): string =>
  ({
    overLimit: t('同じ商品を載せた配信の数', 'Number of deliveries featuring the product'),
    pushAlign: t('同じ日のメールと、テーマがそろっていないプッシュ', 'Pushes whose theme differs from the same-day email'),
    leadMissing: t('販促の期間が、この週にかかる主力の商品', 'Lead items whose promotion period covers this week'),
    repeat: t('同じチャネルで、すぐ前の配信と同じ(前の週の最後の配信を含む)', 'Same as the previous delivery on the same channel (including the last one of the previous week)'),
    openComments: t('配信カードのやり取り(質問・指摘)で、まだ解決にしていないもの', 'Conversations (questions, feedback) on delivery cards not resolved yet'),
    openQuestions: t('質問で、まだ解決していないもの', 'Questions that are not resolved yet'),
    aiUnchecked: t('AI でまとめて中身を作り、まだ人が確かめていない配信(配信カードを開いて保存するか、「確認した」を押すと外れる)', 'Deliveries whose content AI created in bulk and nobody has checked yet (cleared when you save the card or press “Checked”)'),
    approved: t('まだ承認されていない配信', 'Deliveries not approved yet'),
  })[k]

/** 確認の一覧の項目で、問題があるときに何をするか(項目の横と、選んだときに出す) */
export const checkAction = (t: T, k: CheckKey): string =>
  ({
    overLimit: t('ほかの商品に差し替える', 'Swap in other products'),
    pushAlign: t('プッシュのテーマを、同じ日のメールにそろえる', 'Match the push theme to the same-day email'),
    leadMissing: t('どれかの配信に載せる', 'Feature them in a delivery'),
    repeat: t('テーマかメイン画像を変える', 'Change the theme or main image'),
    openComments: t('返信して、解決にする', 'Reply and resolve'),
    openQuestions: t('質問に返信して、解決にする', 'Reply to and resolve the questions'),
    aiUnchecked: t('中身を確かめて「確認した」を押す(直すなら、配信カードで保存)', 'Check the content and press “Checked” (or fix and save the card)'),
    approved: t('配信を承認する', 'Approve the deliveries'),
  })[k]

/** 承認の履歴の、操作の文言 */
export const actionText = (t: T, a?: EventAction): string =>
  ({
    submit: t('週をレビューに出した', 'Submitted the week for review'),
    draft: t('週を下書きに戻した', 'Put the week back to draft'),
    confirm: t('週を確定した', 'Confirmed the week'),
    unconfirm: t('週の確定を取り消した', 'Undid the week confirmation'),
    status: t('ステータスを変えた', 'Changed the status'),
    reopen: t('確定後に変えた(週の確定を解いた)', 'Changed after confirmation (week no longer confirmed)'),
    approve: t('承認した', 'Approved'),
    reject: t('差し戻した', 'Sent back'),
    revoke: t('承認後に内容が変わったので、承認待ちに戻した', 'Content changed after approval, back to awaiting approval'),
    bulk_create: t('AI でまとめて作成した', 'Created with AI in bulk'),
    user_change: t('ユーザーを変えた', 'Changed a user'),
    group_change: t('承認グループを変えた', 'Changed an approval group'),
    rule_change: t('承認の決まりを変えた', 'Changed the approval rule'),
    request: t('承認を依頼した', 'Requested approval'),
    withdraw: t('承認の依頼を取り下げた', 'Withdrew the approval request'),
  })[a ?? 'status'] ?? ''
