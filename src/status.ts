import {
  DeliveryCardStatus as Status,
  DeliveryCardChannel as Channel,
  DeliveryCardCountry as Country,
  DeliveryCardDepartment as Department,
} from './models/deliveryCards'
import { optionLabel, tr } from './i18n'

const optionsOf = <K extends string>(o: Record<K, string>) => (Object.entries(o) as [K, string][]).map(([value, label]) => ({ value, label }))

// データの値の進行順(未起案 → 検討中 → 承認済み → 確定)。前後を比べるときは、この 4 つで比べる
const allStatusOptions = optionsOf(Status)

/**
 * 画面に出すステータス(バックログ U6。2026-10-17 に見せ方だけを整理した。docs/APPROVAL.md)。
 * 「確定」は週だけの言葉にし、確定した週の配信は「承認済み」に鍵マーク(LockMark)で見せる。検討中は「承認待ち」と呼ぶ。
 * データの値(confirmed など)は変えていないので、絞り込み・件数・色は、statusView でこの 3 つにまとめてから使う
 */
export type ViewStatus = 'not_started' | 'reviewing' | 'approved'
export const statusOptions: { value: ViewStatus; label: string }[] = [
  { value: 'not_started', label: Status.not_started },
  { value: 'reviewing', label: '承認待ち' },
  { value: 'approved', label: Status.approved },
]

export const channelOptions = optionsOf(Channel)
export const countryOptions = optionsOf(Country)
export const departmentOptions = optionsOf(Department)

/** 状態の進み具合(未起案 0 → 検討中 1 → 承認済み 2 → 確定 3)。「承認済みより前か」などを比べるときに使う */
export const statusRank = (v?: string | null) => Math.max(0, allStatusOptions.findIndex((o) => o.value === v))

/** 画面での見え方の値(確定 → 承認済み)。絞り込み・件数は、これで比べる */
export const statusView = (v?: string | null): ViewStatus => (v === 'confirmed' ? 'approved' : v === 'reviewing' || v === 'approved' ? v : 'not_started')

/** 週が確定して、鍵がかかった配信か(見せ方は 承認済み + 鍵マーク) */
export const isLockedStatus = (v?: string | null) => v === 'confirmed'

/**
 * 画面に出すステータスの名前(英語のときは英語)。確定した週の配信は「承認済み」。
 * full = 履歴など、確定と承認済みを区別して読みたいところ(「承認済み(週が確定)」)
 */
export const statusLabel = (v?: string | null, full = false) =>
  full && isLockedStatus(v) ? tr('承認済み(週が確定)', 'Approved (week confirmed)') : optionLabel(statusOptions.find((o) => o.value === statusView(v))?.label)

// 未起案・承認待ち・承認済み の色分け(確定は、承認済みと同じ色で、鍵マークで見分ける)
const statusColors: Record<ViewStatus, string> = { not_started: '#8a8f98', reviewing: '#d99a1e', approved: '#22a06b' }

export const statusColor = (v?: string | null) => statusColors[statusView(v)]

/** チャネルの値(選択肢)。配信カードはチャネルごとに作る(プレビュー・テンプレートを、チャネルで分ける) */
export const CHANNEL_EMAIL = 'email'
export const CHANNEL_PUSH = 'app'
