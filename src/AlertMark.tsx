import { tokens } from '@fluentui/react-components'
import { AlertFilled } from '@fluentui/react-icons'
import type { CardAlertKind } from './cardAlerts'
import { useT } from './i18n'

const COLOR: Record<CardAlertKind, string> = {
  outOfStock: tokens.colorPaletteRedForeground1,
  lowStock: tokens.colorPaletteDarkOrangeForeground1,
  policyChanged: tokens.colorPalettePurpleForeground2,
  dateChanged: tokens.colorPaletteBlueForeground2,
  overLimit: tokens.colorPaletteMarigoldForeground2,
}

/** カレンダーの配信に付ける、アラートの印(いちばん強い種類の色)。開く前に「この配信には問題がある」とわかるように */
export function AlertMark({ kind }: { kind?: CardAlertKind }) {
  const t = useT()
  if (!kind) return null
  const label = { outOfStock: t('在庫切れの見込みあり', 'Out of stock expected'), lowStock: t('在庫僅少あり', 'Low stock'), policyChanged: t('MD 方針の変更あり', 'MD policy changed'), dateChanged: t('日程の変更あり', 'Date changed'), overLimit: t('週の上限を超えた商品あり', 'Over the weekly limit') }[kind]
  return <AlertFilled aria-label={label} style={{ color: COLOR[kind], flexShrink: 0, verticalAlign: '-2px', marginRight: '2px' }} fontSize={13} />
}
