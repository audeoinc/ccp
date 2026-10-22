import { useState } from 'react'
import { Button, type ButtonProps } from '@fluentui/react-components'
import { CheckmarkRegular, CopyRegular } from '@fluentui/react-icons'
import { copyText } from '../clipboard'

interface Props {
  /** 押したときに写す文字(重い組み立ては、押したときだけ行う) */
  text: () => string
  label?: string
  size?: ButtonProps['size']
  appearance?: ButtonProps['appearance']
  title?: string
}

/** 開発用の画面の「コピー」。押した場所に「コピーしました」を 2 秒出す(どれを写したかが分かるように) */
export function CopyButton({ text, label = 'コピー', size = 'small', appearance = 'subtle', title }: Props) {
  const [done, setDone] = useState(false)
  return (
    <Button
      type="button"
      size={size}
      appearance={appearance}
      title={title}
      icon={done ? <CheckmarkRegular /> : <CopyRegular />}
      onClick={async () => {
        if (await copyText(text())) {
          setDone(true)
          window.setTimeout(() => setDone(false), 2000)
        }
      }}
    >
      {done ? 'コピーしました' : label}
    </Button>
  )
}
