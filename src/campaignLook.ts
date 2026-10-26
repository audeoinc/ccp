// キャンペーン(X79)の見せ方: 時間帯別の札の名前と、同じキャンペーンのカードをそろえる線の色。
// 状態の色(灰・黄・緑・赤)と見分けがつくよう、状態に使わない色の並びから選ぶ
import { tokens } from '@fluentui/react-components'
import { DeliveryCardChannel } from './models/deliveryCards'
import { optionLabel } from './i18n'

const COLORS = [
  tokens.colorPaletteBerryBorderActive,
  tokens.colorPaletteTealBorderActive,
  tokens.colorPalettePurpleBorderActive,
  tokens.colorPaletteBlueBorderActive,
  tokens.colorPaletteDarkOrangeBorderActive,
  tokens.colorPalettePinkBorderActive,
  tokens.colorPaletteSteelBorderActive,
  tokens.colorPaletteGrapeBorderActive,
]

/**
 * 見えているキャンペーンの線の色(キャンペーンの ID → 色)。見えている順に、色の並びから 1 つずつ割り当てる
 * (ID から色を決めると、同じ週の 2 つのキャンペーンが似た色になることがあったため。8 つを超えたら、また初めの色から)
 */
export function campaignColors(ids: (string | null | undefined)[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const id of ids) if (id && !out.has(id)) out.set(id, COLORS[out.size % COLORS.length])
  return out
}

/** キャンペーンに入っているカードの札の名前(「キャンペーン名 › メール」。カードの名前は保存せず、表示のたびに作る) */
export function campaignCardLabel(campaignName: string, channel?: string | null): string {
  const ch = channel ? optionLabel(DeliveryCardChannel[channel as keyof typeof DeliveryCardChannel] ?? channel) : ''
  return [campaignName.trim(), ch].filter(Boolean).join(' › ')
}
