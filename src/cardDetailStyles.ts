// 配信カードの見た目(CardDetail の枠・知らせ・プレビューまわり)。CardDetail から分けた(整理 第3段 ②。詳しい配信カードは 2026-10-28 に消した)
import { makeStyles, tokens } from '@fluentui/react-components'

export const useCardDetailStyles = makeStyles({
  surface: {
    // fixed + inset 0 + margin auto で、画面の中央に置く(relative にすると、標準の中央寄せが効かず、上端に貼りつく)。中の絶対配置の基準にもなる
    position: 'fixed',
    inset: 0,
    margin: 'auto',
    padding: 0,
    overflow: 'hidden',
    maxWidth: 'none',
    width: 'min(1800px, (98vw / var(--ui-zoom, 1)))',
    height: 'calc(92vh / var(--ui-zoom, 1))',
    maxHeight: 'calc(92vh / var(--ui-zoom, 1))',
    '@media (max-width: 899px)': {
      width: 'calc(100vw / var(--ui-zoom, 1))',
      height: 'calc(100vh / var(--ui-zoom, 1))',
      maxHeight: 'calc(100vh / var(--ui-zoom, 1))',
      borderRadius: 0,
    },
  },
  form: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  overlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 20,
    display: 'grid',
    placeContent: 'center',
    justifyItems: 'center',
    rowGap: '16px',
    paddingLeft: '24px',
    paddingRight: '24px',
    textAlign: 'center',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  overlayBar: { width: '320px' },
  caption: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightRegular },
  error: { margin: '12px 12px 0' },
  // 確定した週の配信: 上の知らせと、保存の前の理由の入力欄
  locked: { margin: '0 24px 8px' },
  reasonActions: { display: 'flex', justifyContent: 'flex-end', columnGap: '8px' },
  // 承認・差し戻しは、保存・キャンセルと離して左に置く(押し間違えないように)
})
