// プレビューの右下の倍率の操作(− ・倍率・＋・全体を表示。Ctrl + ホイールでも)。
// 真ん中はいつも実際の倍率を出し、押すと 100%。全体を表示は別のボタン(以前は真ん中に「全体」と出していて、押すと全体になると読めてしまった。2026-11-02 利用者)。
// 配信カード(SimpleCardLayout)と制作のシンプルな画面(X86)で同じものを使う。左に、その画面のキーの操作の ⓘ を添えられる
import { Button, InfoLabel, ToggleButton, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { AddRegular, ArrowExpandRegular, SubtractRegular } from '@fluentui/react-icons'
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
      <Tooltip content={t('100% にする', 'Set to 100%')} relationship="description">
        <button type="button" className={s.label} onClick={() => zoom.set(1)}>
          {`${Math.round(zoom.shown * 100)}%`}
        </button>
      </Tooltip>
      <Button type="button" size="small" appearance="subtle" icon={<AddRegular />} onClick={() => zoom.step(0.1)} aria-label={t('拡大', 'Zoom in')} />
      {/* 全体を表示している間は、押された状態にする(いまどちらかが、ボタンを見れば分かるように) */}
      <Tooltip content={t('全体を表示', 'Fit the whole email')} relationship="label">
        <ToggleButton type="button" size="small" appearance="subtle" icon={<ArrowExpandRegular />} checked={zoom.mode === 'fit'} onClick={() => zoom.set('fit')} />
      </Tooltip>
    </div>
  )
}
