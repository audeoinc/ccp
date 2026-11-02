// 自動で決めた表示の大きさ(settings.me.autoscale)を知らせる帯。100% 以外にしたときに、最初の 1 回だけ出す(大きさを変えるメニューに気づかない人がいるため。2026-11-02 利用者)。
// 出したことはブラウザごとに覚え、2 回目からは出さない(別の画面で開いて自動の値が変わったときも出さない)。
// 公開の設定を読み終えて、自動が非公開と分かったら、いままでどおりの 100% に戻す
import { useEffect, useState } from 'react'
import { Button, MessageBar, MessageBarActions, MessageBarBody } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import { useT } from './i18n'
import { useFeature } from './featureFlags'
import { PREF } from './prefKeys'
import { readRaw, writeRaw } from './settings'
import { dropUiScaleAuto, getUiScale, isUiScaleAuto, useUiScale, useUiScaleAuto } from './uiScale'

export function UiScaleNotice({ className }: { className?: string }) {
  const t = useT()
  const on = useFeature('settings.me.autoscale')
  const auto = useUiScaleAuto()
  const scale = useUiScale()
  // 出すかどうかは、開いたときに 1 回だけ決める
  const [show, setShow] = useState(() => isUiScaleAuto() && getUiScale() !== 1 && readRaw(PREF.uiScaleAutoNoticed) === null)
  useEffect(() => {
    if (show) writeRaw(PREF.uiScaleAutoNoticed, '1')
  }, [show])
  useEffect(() => {
    if (!on) dropUiScaleAuto()
  }, [on])
  // 自分で大きさを選んだら、もう要らない
  if (!show || !on || !auto) return null
  const pct = Math.round(scale * 100)
  return (
    <MessageBar layout="multiline" intent="info" className={className}>
      <MessageBarBody>{t(`画面に合わせて ${pct}% で開きました。右上のメニューで変えられます`, `Opened at ${pct}% to fit your screen. You can change it from the menu at the top right.`)}</MessageBarBody>
      <MessageBarActions containerAction={<Button appearance="transparent" size="small" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={() => setShow(false)} />} />
    </MessageBar>
  )
}
