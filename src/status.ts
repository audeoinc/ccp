import {
  DeliveryCardStatus as Status,
  DeliveryCardChannel as Channel,
  DeliveryCardCountry as Country,
  DeliveryCardDepartment as Department,
} from './models/deliveryCards'

const optionsOf = <K extends string>(o: Record<K, string>) => (Object.entries(o) as [K, string][]).map(([value, label]) => ({ value, label }))

export const statusOptions = optionsOf(Status)
export const channelOptions = optionsOf(Channel)
export const countryOptions = optionsOf(Country)
export const departmentOptions = optionsOf(Department)

// 進行順(未起案→検討中→承認済み→確定)の色分け
const statusColors = ['#8a8f98', '#d99a1e', '#3b82f6', '#22a06b']
/** 状態の進み具合(未起案 0 → 検討中 1 → 承認済み 2 → 確定 3)。「承認済みより前か」などを比べるときに使う */
export const statusRank = (v?: string | null) => Math.max(0, statusOptions.findIndex((o) => o.value === v))

export const statusColor = (v?: string) => {
  const idx = statusOptions.findIndex((o) => o.value === v)
  return statusColors[idx < 0 ? 0 : idx]
}

/** チャネルの値(選択肢)。配信カードはチャネルごとに作る(プレビュー・テンプレートを、チャネルで分ける) */
export const CHANNEL_EMAIL = 'email'
export const CHANNEL_PUSH = 'app'
