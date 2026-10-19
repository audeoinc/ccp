import { makeStyles, tokens } from '@fluentui/react-components'
import { useT } from './i18n'
import { FACE_COLOR, FACE_TINT, type Face } from './faces'

const useStyles = makeStyles({
  // チャネルの札(塗りつぶし)と見分けられるよう、こちらは薄い地に、面の色の枠と文字
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
    height: '24px',
    padding: '0 10px',
    boxSizing: 'border-box',
    borderRadius: tokens.borderRadiusMedium,
    border: '1.5px solid currentColor',
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightBold,
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
  },
})

/**
 * フロート(配信カード・制作のページ・詳しい結果)の題名の左に出す、面の札(X38)。
 * どの面のものを見ているかを、ヘッダーの下の帯と同じ色で示す
 */
export function FaceBadge({ face }: { face: Face }) {
  const s = useStyles()
  const t = useT()
  const name = { calendar: t('計画', 'Plan'), production: t('制作', 'Production'), results: t('結果', 'Results') }[face]
  return (
    <span className={s.root} style={{ color: FACE_COLOR[face], backgroundColor: FACE_TINT[face] }}>
      {name}
    </span>
  )
}
