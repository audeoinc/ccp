import type { ReactNode } from 'react'
import { Button, Spinner } from '@fluentui/react-components'
import { AiIcon } from './AiMark'
import { useT } from './i18n'

/** AI に頼むボタン(考えている間は、押せなくして「考え中...」と出す)。中ペインと、制作とのやり取りで使う */
export function AiButton({ busy, disabled, onClick, children }: { busy: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  const t = useT()
  return (
    <Button appearance="outline" size="small" onClick={onClick} disabled={busy || disabled} icon={busy ? <Spinner size="extra-tiny" /> : <AiIcon />}>
      {busy ? t('考え中...', 'Thinking...') : children}
    </Button>
  )
}
