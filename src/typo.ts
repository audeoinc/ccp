import { tokens } from '@fluentui/react-components'

/**
 * 文字の階層(ARCHITECTURE の 7 章「見た目の約束事」)。makeStyles の中で広げて使う(例 `title: { ...typo.heading, minWidth: 0 }`)。
 * 画面ごとに 14px・16px・10px がまざっていたので(simple-ui-review-2 の 18・19)、ここに 1 つにする
 */
export const typo = {
  /** 見出し・カードのタイトル: 13px・中太 */
  heading: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold },
  /** ラベル(項目名): 12px・中太・薄いグレー(入力欄の Field のラベルは index.css で同じ形) */
  label: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  /** 補足: 12px・薄いグレー */
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
} as const
