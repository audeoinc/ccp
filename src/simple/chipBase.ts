// 上の帯の状態の札の形(高さ 24px・丸い角・12px の太字)。制作・結果の札(StageChip)と計画の承認の札(ApprovalChip)で同じ形にする
import { tokens } from '@fluentui/react-components'

export const chipBase = {
  display: 'inline-flex',
  alignItems: 'center',
  columnGap: '6px',
  height: '24px',
  boxSizing: 'border-box',
  padding: '0 10px 0 8px',
  borderRadius: tokens.borderRadiusCircular,
  fontFamily: 'inherit',
  fontSize: '12px',
  fontWeight: tokens.fontWeightSemibold,
  whiteSpace: 'nowrap',
  flexShrink: 0,
} as const
