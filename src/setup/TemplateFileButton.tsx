// 設定の型のファイルを選ぶボタン(⚙ の「設定の状態」と、初期設定の画面の 2 か所)
import { useRef, type ReactNode } from 'react'
import { Button } from '@fluentui/react-components'
import { ArrowUploadRegular } from '@fluentui/react-icons'
import { useT } from '../i18n'

export function TemplateFileButton({ disabled, children, onPick, onError }: { disabled?: boolean; children: ReactNode; onPick: (template: unknown) => void; onError: (message: string) => void }) {
  const t = useT()
  const input = useRef<HTMLInputElement>(null)
  const read = async (file: File) => {
    try {
      onPick(JSON.parse(await file.text()))
    } catch {
      onError(t('ファイルを読めませんでした(設定の型の JSON を選んでください)', 'Could not read the file (choose a settings template JSON).'))
    }
  }
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          // 同じファイルをもう一度選んでも動くように、すぐ空にする
          e.target.value = ''
          if (file) void read(file)
        }}
      />
      <Button icon={<ArrowUploadRegular />} disabled={disabled} onClick={() => input.current?.click()}>
        {children}
      </Button>
    </>
  )
}
