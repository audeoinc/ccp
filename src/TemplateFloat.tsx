// 設定の画面(ST10)の「テンプレート」: テンプレートの管理・編集を、設定の画面の中ではなく、別の大きなフロートで開く。
// 設定の画面の中では編集の場所が狭いため(2026-10-26 利用者の要望)。中身は TemplateManager をそのまま入れ、入れ物と入口だけをここに持つ
// (テンプレートの編集の部品は、ほかのメンバーの担当なので変えない)。
// 設定の画面で「テンプレート」を選ぶと、すぐにフロートを開く。閉じたあとは、右の「開く」でまた開ける
import { useRef, useState, type ComponentProps } from 'react'
import { Button, makeStyles, tokens } from '@fluentui/react-components'
import { LayoutColumnTwoRegular } from '@fluentui/react-icons'
import { BigFloat } from './BigFloat'
import { TemplateManager } from './TemplateManager'
import { useT } from './i18n'

const useStyles = makeStyles({
  // TemplateManager の inline は枠つきの入れ物なので、フロートの中では余白を取って、残りの高さいっぱいに
  content: { display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0, padding: tokens.spacingHorizontalM },
})

type ManagerProps = Omit<ComponentProps<typeof TemplateManager>, 'inline'>

/** 編集の途中か。TemplateManager は編集中だけ、下に「保存」の並びを出すので、それで見る(中の部品を変えずに、閉じる前に確かめるため) */
const isEditing = (box: HTMLElement | null) => !!box && [...box.querySelectorAll('button')].some((b) => /^(保存|Save|保存中\.\.\.|Saving\.\.\.)$/.test(b.textContent?.trim() ?? ''))

/** テンプレートの管理・編集の、大きなフロート(大きさを変えられ、題の行で動かせ、画面いっぱいまで広げられる。大きさは覚える。BigFloat) */
export function TemplateFloat({ onClose, ...props }: ManagerProps & { onClose: () => void }) {
  const s = useStyles()
  const t = useT()
  const boxRef = useRef<HTMLDivElement>(null)
  const close = () => {
    // 保存していない編集は、テンプレートの管理の中と同じ文で確かめる
    if (isEditing(boxRef.current) && !window.confirm(t('編集中の内容を破棄します。よろしいですか?', 'Discard the current edits?'))) return
    onClose()
  }
  return (
    <BigFloat sizeKey="templateManager" title={t('テンプレート', 'Templates')} onClose={close}>
      <div ref={boxRef} className={s.content}>
        <TemplateManager inline {...props} />
      </div>
    </BigFloat>
  )
}

/** 設定の画面の「テンプレート」の欄: 選んだらすぐフロートを開き、閉じたあとは「開く」で開き直す */
export function TemplateSettingsPane(props: ManagerProps) {
  const t = useT()
  const [open, setOpen] = useState(true)
  return (
    <>
      <span>
        <Button appearance="primary" icon={<LayoutColumnTwoRegular />} onClick={() => setOpen(true)}>
          {t('テンプレートを開く', 'Open templates')}
        </Button>
      </span>
      {open && <TemplateFloat {...props} onClose={() => setOpen(false)} />}
    </>
  )
}
