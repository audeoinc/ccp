import { tokens } from '@fluentui/react-components'

/**
 * 文字の階層(ARCHITECTURE の 7 章「見た目の約束事」)。makeStyles の中で広げて使う(例 `title: { ...typo.heading, minWidth: 0 }`)。
 * 画面ごとに 14px・16px・10px がまざっていたので(simple-ui-review-2 の 18・19)、ここに 1 つにする。
 * ラベルと値は、大きさ・濃さで分ける(ラベルが値と同じに見えて読み取りにくかった。2026-10-27 利用者)。並べるときは LabeledValue を使う
 */
export const typo = {
  /** 見出し・カードのタイトル: 13px・中太 */
  heading: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold },
  /** ラベル(項目名): 11px・ふつうの太さ・薄いグレー(入力欄の Field のラベルは index.css で同じ形) */
  label: { fontSize: '11px', lineHeight: '16px', fontWeight: tokens.fontWeightRegular, color: tokens.colorNeutralForeground3 },
  /** 値: 13px・濃い色 */
  value: { fontSize: '13px', lineHeight: '18px', fontWeight: tokens.fontWeightRegular, color: tokens.colorNeutralForeground1 },
  /** いちばん大事な値(名前など): 値を太く */
  valueStrong: { fontSize: '13px', lineHeight: '18px', fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  /** 空の値(未設定・(未設定)・—): ラベルと同じ薄さ。値が入っている所が目に入るように */
  empty: { color: tokens.colorNeutralForeground3 },
  /** 補足: 12px・薄いグレー */
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
} as const
