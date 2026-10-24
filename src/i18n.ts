import { useSyncExternalStore } from 'react'
import { PREF } from './prefKeys'
import { readRaw, writeRaw } from './settings'

// 画面の言語(日本語 / English)。ブラウザごとに保存し、初期値はビルドの設定(VITE_DEFAULT_LANG)、なければブラウザの言語。
// 文言は、その場に「日本語, English」の組で書く: tr('保存', 'Save')。React の外(AI の処理など)でも使える。
export type Lang = 'ja' | 'en'


function detect(): Lang {
  // 保存を読めないときは、ブラウザの言語に従う
  const v = readRaw(PREF.lang)
  if (v === 'ja' || v === 'en') return v
  // ビルドの設定(English)があれば、それを初期値にする。なければ、ブラウザの言語
  const preset = import.meta.env.VITE_DEFAULT_LANG
  if (preset === 'ja' || preset === 'en') return preset
  return navigator.language?.toLowerCase().startsWith('ja') ? 'ja' : 'en'
}

let current: Lang = detect()
const listeners = new Set<() => void>()

export const getLang = (): Lang => current

export function setLang(lang: Lang) {
  if (lang === current) return
  current = lang
  writeRaw(PREF.lang, lang)
  document.documentElement.lang = lang
  listeners.forEach((fn) => fn())
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** 現在の言語に合う文言を返す */
export const tr = (ja: string, en: string): string => (current === 'ja' ? ja : en)

/** 言語が切り替わったら、再描画する。コンポーネントの先頭で `const t = useT()` と書く */
export function useT(): typeof tr {
  useSyncExternalStore(subscribe, getLang)
  return tr
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang)
}

/** 日付・数値の表記に使うロケール */
export const locale = (): string => (current === 'ja' ? 'ja-JP' : 'en-US')

export type Market = 'JP' | 'US'

/** 価格の表記。US の商品はドル、JP の商品は円 */
export function priceText(v?: number, market: Market = 'JP'): string {
  if (v === undefined) return '-'
  return market === 'US'
    ? `$${v.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`
    : `¥${v.toLocaleString('ja-JP')}`
}

// 選択肢のラベル(日本語)の、英語表記。値は変えずに、表示だけを切り替える
const OPTION_EN: Record<string, string> = {
  // やり取りのリアクション・制作の依頼の状態(PR5・PR6)
  了解: 'OK',
  見ています: 'Looking',
  対応します: 'On it',
  ありがとう: 'Thanks',
  確認したい: 'Question',
  依頼済み: 'Requested',
  制作している: 'In production',
  制作が終わった: 'Production done',
  配信のしくみに送った: 'Sent to delivery system',
  古い版: 'Outdated',
  取り下げた: 'Withdrawn',
  仕上がりを確認した: 'Result checked',
  // ステータス
  未起案: 'Not started',
  検討中: 'In review',
  承認待ち: 'Awaiting approval',
  承認済み: 'Approved',
  確定: 'Confirmed',
  // ユーザー・承認グループ
  メンバー: 'Member',
  管理者: 'Admin',
  有効: 'Active',
  無効: 'Inactive',
  // 承認の依頼
  全員: 'Everyone',
  '1 人': 'Any one',
  依頼中: 'Open',
  差し戻し: 'Changes requested',
  古い依頼: 'Stale',
  取り下げ: 'Withdrawn',
  未定: 'Pending',
  // チャネル
  メール: 'Email',
  プッシュ: 'Push',
  // 配信種別(部署)
  販促: 'Promotion',
  // 商品カテゴリ
  アウター: 'Outerwear',
  トップス: 'Tops',
  ボトムス: 'Bottoms',
  シューズ: 'Shoes',
  小物: 'Accessories',
  バッグ: 'Bags',
  ホーム: 'Home',
  // 売上トレンド
  上昇: 'Rising',
  横ばい: 'Flat',
  下降: 'Falling',
  // 季節
  秋: 'Fall',
  冬: 'Winter',
  秋冬: 'Fall/Winter',
  通年: 'All year',
  // 部品の画像の種類(X59 ③)
  ボタン: 'Button',
  バナー: 'Banner',
  ロゴ: 'Logo',
  アイコン: 'Icon',
  その他: 'Other',
  // 天候適性
  晴れ: 'Sunny',
  雨の日: 'Rainy',
  寒い日: 'Cold',
  // メイン画像の用途
  新作: 'New arrivals',
  特集: 'Feature',
  セール: 'Sale',
  会員: 'Members',
  イベント: 'Event',
  // 掲載商品
  手動: 'Manual',
  選定: 'Selected',
  候補: 'Candidate',
  // メールのテンプレート
  自由: 'Free',
}

/** 選択肢のラベルを、現在の言語で返す(辞書にないものは、そのまま) */
export const optionLabel = (label?: string): string => (label === undefined ? '' : current === 'ja' ? label : (OPTION_EN[label] ?? label))
