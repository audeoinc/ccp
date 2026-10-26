import { makeStyles, tokens } from '@fluentui/react-components'
import { ImageThumb } from './ImageThumb'
import { useT } from './i18n'

const useStyles = makeStyles({
  // 写真だけが押せる所。乗せると枠で強調し、指の形のカーソルにする(行のほかの所は、押すとすぐ入れ替わる)
  btn: {
    flexShrink: 0,
    padding: 0,
    border: 'none',
    background: 'none',
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    lineHeight: 0,
    ':hover': { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: '1px' },
    ':focus-visible': { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: '1px' },
  },
})

/**
 * 入れ替えの候補の行の写真(2026-10-26 利用者と決めた案 A)。写真を押すと、その候補の詳しい情報が開く
 * (部品のペインの「箱を押すと詳しい情報」と同じ決まり。ⓘ は使い方・言葉の説明に使うので、業務の流れの中では使わない)。
 * 行の中に置くので、押しても行の動き(すぐ入れ替える)には伝えない。キーボードでも開けるようにボタンにする
 */
export function ProductThumbButton({ src, name, width, height, onClick }: { src?: string; name: string; width: number; height: number; onClick: () => void }) {
  const s = useStyles()
  const t = useT()
  return (
    <button
      type="button"
      className={s.btn}
      aria-label={t(`${name} の詳しい情報`, `Details for ${name}`)}
      onClick={(ev) => {
        ev.stopPropagation()
        onClick()
      }}
      onKeyDown={(ev) => ev.stopPropagation()}
    >
      <ImageThumb src={src} alt={name} width={width} height={height} caption={t('詳しい情報', 'Details')} />
    </button>
  )
}
