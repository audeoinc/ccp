import { tokens } from '@fluentui/react-components'
import type { CardAlertKind } from './cardAlerts'

/** アラートの種類の色(ほかの印でも、同じ色で見分けられるように) */
export const ALERT_COLOR: Record<CardAlertKind, string> = {
  outOfStock: tokens.colorPaletteRedForeground1,
  lowStock: tokens.colorPaletteDarkOrangeForeground1,
  policyChanged: tokens.colorPalettePurpleForeground2,
  dateChanged: tokens.colorPaletteBlueForeground2,
  overLimit: tokens.colorPaletteMarigoldForeground2,
  imageExpired: tokens.colorPaletteTealForeground2,
}
