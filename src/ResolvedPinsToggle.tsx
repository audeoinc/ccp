import { useSyncExternalStore } from 'react'
import { ToggleButton, Tooltip } from '@fluentui/react-components'
import { CommentCheckmarkRegular } from '@fluentui/react-icons'
import { setShowResolvedPins, showResolvedPins, subscribePins } from './pinStore'
import { useT } from './i18n'

/**
 * 「解決したピンも出す」の切り替え(X65 (c)。2026-10-24 利用者)。ピンのボタンの横に置く(シンプル・詳しい配信カード、制作のページ)。
 * 右クリックのメニューの項目と同じ値を、人ごとに覚える(pinStore)
 */
export function ResolvedPinsToggle({ withLabel }: { withLabel?: boolean }) {
  const t = useT()
  const on = useSyncExternalStore(subscribePins, showResolvedPins)
  const label = t('解決したピンも出す', 'Show resolved pins')
  return (
    <Tooltip content={on ? t('解決したピンも出しています(押すと、未解決だけに戻す)', 'Showing resolved pins too (click to show unresolved only)') : label} relationship="label">
      <ToggleButton type="button" size="small" appearance={on ? 'primary' : 'subtle'} checked={on} icon={<CommentCheckmarkRegular />} onClick={() => setShowResolvedPins(!on)}>
        {withLabel ? label : undefined}
      </ToggleButton>
    </Tooltip>
  )
}
