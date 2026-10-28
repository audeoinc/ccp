// プレビューの右下の倍率の操作(− ・倍率・＋。数字を押すと、全体表示と 100% を行き来する。Ctrl + ホイールでも)。
// 配信カード(SimpleCardLayout)と制作のシンプルな画面(X86)で同じものを使う。左に、その画面のキーの操作の ⓘ を添えられる
import { Button, InfoLabel, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { AddRegular, SubtractRegular } from '@fluentui/react-icons'
import { useT } from '../i18n'
import type { PreviewZoom } from './usePreviewNav'

const useStyles = makeStyles({
  box: {
    position: 'absolute',
    right: '14px',
    bottom: '10px',
    zIndex: 5,
    display: 'flex',
    alignItems: 'center',
    columnGap: '2px',
    padding: '2px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow8,
  },
  label: { minWidth: '44px', padding: '0 2px', border: 'none', backgroundColor: 'transparent', fontFamily: 'inherit', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground1, cursor: 'pointer', textAlign: 'center', fontVariantNumeric: 'tabular-nums' },
})

/** 置く所は、プレビューの枠(スクロールする箱)の外の、position: relative の親(箱の右下に重ねる) */
export function PreviewZoomBar({ zoom, keysInfo }: { zoom: PreviewZoom; keysInfo?: string }) {
  const s = useStyles()
  const t = useT()
  return (
    <div className={s.box}>
      {keysInfo && (
        <InfoLabel size="small" info={keysInfo}>
          {t('キー', 'Keys')}
        </InfoLabel>
      )}
      <Button type="button" size="small" appearance="subtle" icon={<SubtractRegular />} onClick={() => zoom.step(-0.1)} aria-label={t('縮小', 'Zoom out')} />
      <Tooltip content={zoom.mode === 'fit' ? t('100% にする', 'Set to 100%') : t('全体を表示', 'Fit the whole email')} relationship="description">
        <button type="button" className={s.label} onClick={() => zoom.set(zoom.mode === 'fit' ? 1 : 'fit')}>
          {zoom.mode === 'fit' ? t('全体', 'Fit') : `${Math.round(zoom.shown * 100)}%`}
        </button>
      </Tooltip>
      <Button type="button" size="small" appearance="subtle" icon={<AddRegular />} onClick={() => zoom.step(0.1)} aria-label={t('拡大', 'Zoom in')} />
    </div>
  )
}
