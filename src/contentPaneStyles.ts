// 中ペイン(ContentPane)と、その中のタブ(HeroTab・SectionsTab)の見た目。ContentPane から分けた(整理 第3段 ③)
import { makeStyles, tokens } from '@fluentui/react-components'

export const useContentPaneStyles = makeStyles({
  inboxBlock: { display: 'grid', rowGap: '8px', marginTop: '16px', paddingTop: '12px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  assetsBlock: { marginTop: '16px', paddingTop: '12px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  uploadRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '8px', rowGap: '4px', marginTop: '4px' },
  // グリッドの子は、中身が長くても列を押し広げない(帯や長い文がペインからはみ出さないように)
  // 中ペイン全体: 上は内容(スクロール)、下は AI チャット(固定)
  shell: { flexGrow: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' },
  // 見出しとタブは、内容をスクロールしても見えるように、スクロールの外に固定する
  head: { display: 'grid', rowGap: '8px', minWidth: 0, padding: '16px 16px 0', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  scroll: { flexGrow: 1, minHeight: 0, overflowY: 'auto', padding: '16px' },
  grid12: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', rowGap: '12px', minWidth: 0 },
  grid8: { display: 'grid', rowGap: '8px', minWidth: 0 },
  grid4: { display: 'grid', rowGap: '4px', minWidth: 0 },
  grid2: { display: 'grid', rowGap: '2px', minWidth: 0 },
  flexRow: { display: 'flex', alignItems: 'center', columnGap: '8px', rowGap: '4px', flexWrap: 'wrap', minWidth: 0 },
  flexRowTight: { display: 'flex', alignItems: 'center', columnGap: '6px', rowGap: '4px', flexWrap: 'wrap', minWidth: 0 },
  flexEnd: { display: 'flex', justifyContent: 'flex-end' },
  caption: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightRegular, lineHeight: tokens.lineHeightBase200, color: tokens.colorNeutralForeground3 },
  lead: { fontWeight: tokens.fontWeightSemibold },
  value: { fontWeight: tokens.fontWeightRegular, fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground1 },
  // 値と、それに付く補足(AIの理由など)は 1 つのグループ。補足は小さく薄く、値の真下に寄せる
  group: { display: 'grid', rowGap: '2px', minWidth: 0 },
  noteBox: {
    display: 'flex',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    columnGap: '6px',
    paddingLeft: '8px',
    borderLeft: `2px solid ${tokens.colorNeutralStroke1}`,
    fontSize: '11px',
    lineHeight: '16px',
    color: tokens.colorNeutralForeground3,
  },
  // 案の一覧の見出し。上の「現在の値」のグループとは、区切って別のグループにする
  listHead: {
    marginTop: '8px',
    paddingTop: '12px',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  warn: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteDarkOrangeForeground1 },
  bold: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1 },
  semibold: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1 },
  tabs: {
    minWidth: 0,
    maxWidth: '100%',
    overflowX: 'auto',
    overflowY: 'hidden',
    flexWrap: 'nowrap',
    columnGap: '4px',
    '& button': { flexShrink: 0, whiteSpace: 'nowrap' },
  },
  // 面の切り替え(コンテンツ生成 / やり取り)。見出しの代わりに置き、その下のタブとは大きさで区別する
  areas: { minWidth: 0 },
  // Block
  block: {
    display: 'grid',
    rowGap: '8px',
    padding: '12px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    minWidth: 0,
  },
  blockHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', columnGap: '8px', rowGap: '4px', flexWrap: 'wrap' },
  // 開閉できるブロック(Fluent の Accordion。整理 #11)。見出しの行は箱の端まで、中身は余白なしで並べる
  blockHeader: { '& > button': { paddingLeft: 0, paddingRight: 0, minHeight: 'auto', height: 'auto' } },
  blockPanel: { display: 'grid', rowGap: '8px', margin: '8px 0 0 0' },
  blockSummary: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  // Idea cards
  card: {
    padding: '12px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    display: 'grid',
    rowGap: '4px',
    minWidth: 0,
  },
  cardAdopted: { border: `1px solid ${tokens.colorPaletteGreenBorderActive}` },
  pre: { whiteSpace: 'pre-wrap', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  // 制作指示のような長文は、タイトルではなく本文なので、太字にしない
  preBody: { whiteSpace: 'pre-wrap', fontSize: tokens.fontSizeBase200, lineHeight: '20px', fontWeight: tokens.fontWeightRegular, color: tokens.colorNeutralForeground1 },
  copyHeadline: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1, letterSpacing: '0.04em', lineHeight: 1.5 },
  chipStart: { justifySelf: 'start' },
  pick: {
    cursor: 'pointer',
    padding: '8px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    minWidth: 0,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  pickCurrent: {
    border: `1px solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
  },
  // Template
  tplCard: {
    display: 'flex',
    columnGap: '12px',
    padding: '12px',
    cursor: 'pointer',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    minWidth: 0,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  tplCardSelected: { border: `1px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2, ':hover': { backgroundColor: tokens.colorBrandBackground2 } },
  thumb: {
    width: '84px',
    flexShrink: 0,
    // テンプレートの縮図は、メールの見た目(白い紙)なので、画面の色に合わせない(受信側の見た目の例外)
    backgroundColor: '#fff',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusSmall,
    padding: '4px',
    display: 'grid',
    rowGap: '4px',
    alignContent: 'start',
  },
  // 縮図の中の文字(白い紙の上なので、画面の色に合わせない)
  thumbFree: { color: '#888', fontSize: '10px', textAlign: 'center' },
  // Drop zones
  dropZone: { display: 'grid', rowGap: '8px', borderRadius: tokens.borderRadiusMedium, minWidth: 0 },
  dropActive: { outline: `2px dashed ${tokens.colorBrandStroke1}`, outlineOffset: '2px' },
  heroEmpty: {
    padding: '12px',
    border: `2px dashed ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
  },
  heroEmptyActive: { border: `2px dashed ${tokens.colorBrandStroke1}` },
  accordion: {
    marginTop: '8px',
    minWidth: 0,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  accordionPanel: { padding: '12px', minWidth: 0 },
})
