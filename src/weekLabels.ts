// 週のレビューの、項目名・説明・履歴の文言。画面(確認の一覧・週の帯の履歴)と、週の資料(PDF。WeekReport)で同じ言葉にするため、1 か所に置く
import type { CheckKey } from './reviewChecks'
import { WEEKLY_PRODUCT_LIMIT } from './reviewChecks'
import type { EventAction } from './data/events'
import type { tr } from './i18n'

type T = typeof tr

/** 確認の一覧の項目名 */
export const checkTitle = (t: T, k: CheckKey): string =>
  ({
    overLimit: t(`週の上限(${WEEKLY_PRODUCT_LIMIT} 本)を超えた商品`, `Products over the weekly limit (${WEEKLY_PRODUCT_LIMIT})`),
    pushAlign: t('メールとプッシュのテーマ違い', 'Email / push to align'),
    leadMissing: t('載っていない主力の商品', 'Lead items not featured'),
    repeat: t('テーマ・メイン画像の連続', 'Same main image or theme in a row'),
    openComments: t('未対応のコメント', 'Open comments'),
    openQuestions: t('未解決の質問', 'Open questions'),
    approved: t('承認済みの配信', 'Approved deliveries'),
  })[k]

/** 確認の一覧の項目の説明(選んだときに出す) */
export const checkHint = (t: T, k: CheckKey): string =>
  ({
    overLimit: t('同じ商品を載せた配信の数', 'Number of deliveries featuring the product'),
    pushAlign: t('同じ日のメールと、テーマがそろっていないプッシュ', 'Pushes whose theme differs from the same-day email'),
    leadMissing: t('販促の期間が、この週にかかる主力の商品', 'Lead items whose promotion period covers this week'),
    repeat: t('同じチャネルで、すぐ前の配信と同じ(前の週の最後の配信を含む)', 'Same as the previous delivery on the same channel (including the last one of the previous week)'),
    openComments: t('レビューのコメントで、まだ対応済みにしていないもの', 'Review comments not marked resolved yet'),
    openQuestions: t('質問で、まだ解決していないもの', 'Questions that are not resolved yet'),
    approved: t('まだ承認されていない配信', 'Deliveries not approved yet'),
  })[k]

/** 確認の一覧の項目で、問題があるときに何をするか(項目の横と、選んだときに出す) */
export const checkAction = (t: T, k: CheckKey): string =>
  ({
    overLimit: t('ほかの商品に差し替える', 'Swap in other products'),
    pushAlign: t('プッシュのテーマを、同じ日のメールにそろえる', 'Match the push theme to the same-day email'),
    leadMissing: t('どれかの配信に載せる', 'Feature them in a delivery'),
    repeat: t('テーマかメイン画像を変える', 'Change the theme or main image'),
    openComments: t('コメントに対応して、対応済みにする', 'Address and resolve the comments'),
    openQuestions: t('質問に返信して、解決にする', 'Reply to and resolve the questions'),
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
    reopen: t('確定後に変えた(週をレビューに戻した)', 'Changed after confirmation (week back to review)'),
    approve: t('承認した', 'Approved'),
    reject: t('差し戻した', 'Sent back'),
    revoke: t('承認後に内容が変わったので、検討中に戻した', 'Content changed after approval, back to In review'),
    bulk_create: t('AI でまとめて作成した', 'Created with AI in bulk'),
    user_change: t('ユーザーを変えた', 'Changed a user'),
    group_change: t('承認グループを変えた', 'Changed an approval group'),
  })[a ?? 'status'] ?? ''
