import type { Market } from './i18n'

// 商品・メイン画像の「市場」。US 以外(JP、または未設定)は JP とみなす
export const productMarket = (p?: { market?: string }): Market => (p?.market === 'US' ? 'US' : 'JP')
export const heroMarket = productMarket

/** 配信カードの「国」から、使う市場を決める。国が未設定なら null(絞り込まない) */
export function cardMarket(country: string): Market | null {
  return country === 'US' || country === 'JP' ? country : null
}
