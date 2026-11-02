// 押すと文字をコピーする小さいボタン(印だけ)。値の横・行の右端に置く。
// 配信カード(Plan)と制作(Production)で、コピーのボタンの形・言葉・押したあとの印をそろえるため、ここに 1 つにする
// (http の中継でも写せる copyText を使う)
import { useEffect, useRef, useState } from 'react'
import { Button, Tooltip } from '@fluentui/react-components'
import { CheckmarkRegular, CopyRegular } from '@fluentui/react-icons'
import { copyText } from './clipboard'
import { useT } from './i18n'

interface Props {
  text: string
  /** 何をコピーするか(マウスを載せたときの文。省くと「コピー」) */
  label?: string
  className?: string
}

export function CopyButton({ text, label, className }: Props) {
  const t = useT()
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  return (
    <Tooltip content={done ? t('コピーしました', 'Copied') : (label ?? t('コピー', 'Copy'))} relationship="label">
      <Button
        className={className}
        size="small"
        appearance="subtle"
        icon={done ? <CheckmarkRegular /> : <CopyRegular />}
        disabled={!text}
        onClick={(ev) => {
          // 行・部品を押したことにしない(行を押すと選ぶ所に置くことがあるため)
          ev.stopPropagation()
          void copyText(text).then((ok) => {
            if (!ok) return
            setDone(true)
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(() => setDone(false), 1200)
          })
        }}
      />
    </Tooltip>
  )
}
