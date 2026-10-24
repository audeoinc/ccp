import { useRef, useState, type ReactNode } from 'react'
import { Button, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowUploadRegular } from '@fluentui/react-icons'
import { useT } from './i18n'

/*
 * ファイルを落とせる枠(Fluent に部品がないので自前。SU3 の「アップロード」のタブ)。
 * 枠に落としても、ボタンで選んでも、同じ onFile に渡す。
 */

const useStyles = makeStyles({
  root: {
    display: 'grid',
    justifyItems: 'center',
    rowGap: '8px',
    padding: '20px 12px',
    border: `2px dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    textAlign: 'center',
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
  },
  over: { border: `2px dashed ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  icon: { fontSize: '28px', color: tokens.colorNeutralForeground3 },
})

interface Props {
  onFile: (file: File) => void
  /** input の accept(例: '.jpg,.png') */
  accept?: string
  /** 枠の中の説明 */
  hint?: ReactNode
  disabled?: boolean
}

export function DropZone({ onFile, accept, hint, disabled }: Props) {
  const s = useStyles()
  const t = useT()
  const ref = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div
      className={mergeClasses(s.root, over && s.over)}
      onDragOver={(e) => {
        if (disabled || !e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const f = e.dataTransfer.files[0]
        if (disabled || !f) return
        e.preventDefault()
        onFile(f)
      }}
    >
      <ArrowUploadRegular className={s.icon} />
      <span>{hint ?? t('ここにファイルを落とす', 'Drop a file here')}</span>
      <Button size="small" disabled={disabled} onClick={() => ref.current?.click()}>
        {t('ファイルを選ぶ…', 'Choose a file…')}
      </Button>
      <input
        ref={ref}
        type="file"
        hidden
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onFile(f)
        }}
      />
    </div>
  )
}
