import { tr } from './i18n'

/**
 * 空の値の文言(配信カードと制作でそろえる。2026-11-02 Plan と Production の差の 43)。
 * 'unset' = 入れる値がまだ入っていない(未設定)、'none' = 値がないことが正しい(—)
 */
export const emptyValueText = (kind: 'unset' | 'none' = 'unset') => (kind === 'none' ? '—' : tr('未設定', 'Not set'))
