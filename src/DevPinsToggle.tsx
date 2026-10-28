import { useSyncExternalStore } from 'react'
import { ToggleButton, Tooltip } from '@fluentui/react-components'
import { EyeOffRegular, EyeRegular } from '@fluentui/react-icons'
import { devPinsVisible, setDevPinsVisible, subscribeDevRequests } from './devRequestPlace'
import { useT } from './i18n'

/**
 * 開発へのリクエストのピンを出す / 出さないの切り替え(X69 (b)。2026-10-28 利用者)。ヘッダーの「リクエスト」の横に置き、人ごとに覚える。
 * 出さないときも、一覧と右クリックの「開発に伝える」は使える(画面を見せるとき・撮るときに、ピンが邪魔にならないように)
 */
export function DevPinsToggle() {
  const t = useT()
  const on = useSyncExternalStore(subscribeDevRequests, devPinsVisible)
  return (
    <Tooltip content={on ? t('リクエストのピンを出しています(押すと隠す)', 'Request pins are shown (click to hide)') : t('リクエストのピンを隠しています(押すと出す)', 'Request pins are hidden (click to show)')} relationship="label">
      <ToggleButton type="button" size="small" appearance="subtle" checked={!on} icon={on ? <EyeRegular /> : <EyeOffRegular />} onClick={() => setDevPinsVisible(!on)} />
    </Tooltip>
  )
}
