// 「？ 聞く」の材料(ビルドのときに helpMaterial.ts が作る)。形は helpMaterial.ts の HelpLabel・HelpSection と同じ
// (画面の側から helpMaterial.ts を読むと、Node の型まで入ってしまうので、ここに同じ形を書く)
declare module 'virtual:help-material' {
  const material: {
    /** 画面の文言: [日本語, English, ファイル(src/ から), 部品, 画面の場所(screens の番号。-1 = 分からない)] */
    labels: [string, string, string, string, number][]
    /** 文書の節(FEATURES・SOURCE_MAP・FEATURE_REASONS を見出しごとに分けたもの) */
    sections: { doc: string; title: string; text: string }[]
    /** 画面の場所の呼び名 [日本語, English] */
    screens: [string, string][]
  }
  export default material
}
