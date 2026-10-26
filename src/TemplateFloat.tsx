// 設定の画面(ST10)の「テンプレート」: テンプレートの管理・編集を、設定の画面の中ではなく、別の大きなフロートで開く。
// 設定の画面の中では編集の場所が狭いため(2026-10-26 利用者の要望)。中身は TemplateManager をそのまま入れ、入れ物と入口だけをここに持つ
// (テンプレートの編集の部品は、ほかのメンバーの担当なので変えない)。
// 設定の画面で「テンプレート」を選ぶと、すぐにフロートを開く。閉じたあとは、右の「開く」でまた開ける
import { useRef, useState, type ComponentProps } from 'react'
import { Button, Dialog, DialogBody, DialogTitle, makeStyles, tokens } from '@fluentui/react-components'
import { DismissRegular, LayoutColumnTwoRegular } from '@fluentui/react-icons'
import { ResizableSurface } from './ResizableSurface'
import { TemplateManager } from './TemplateManager'
import { useT } from './i18n'

const useStyles = makeStyles({
  // 既定の幅は 1280px まで。広げた大きさ(ResizableSurface の width)を止めないよう、maxWidth は付けない
  surface: { width: 'min(1280px, calc(94vw / var(--ui-zoom, 1)))', maxWidth: 'none', height: 'calc(86vh / var(--ui-zoom, 1))', maxHeight: 'none', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  body: { display: 'flex', flexDirection: 'column', rowGap: 0, flexGrow: 1, minHeight: 0 },
  title: { display: 'flex', alignItems: 'center', padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  titleText: { flexGrow: 1 },
  // TemplateManager の inline は枠つきの入れ物なので、フロートの中では余白を取って、残りの高さいっぱいに
  content: { display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0, padding: tokens.spacingHorizontalM },
})

type ManagerProps = Omit<ComponentProps<typeof TemplateManager>, 'inline'>

/** 編集の途中か。TemplateManager は編集中だけ、下に「保存」の並びを出すので、それで見る(中の部品を変えずに、閉じる前に確かめるため) */
const isEditing = (box: HTMLElement | null) => !!box && [...box.querySelectorAll('button')].some((b) => /^(保存|Save|保存中\.\.\.|Saving\.\.\.)$/.test(b.textContent?.trim() ?? ''))

/** テンプレートの管理・編集の、大きなフロート(大きさを変えられ、題の行で動かせる。大きさは覚える) */
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
    <Dialog open modalType="modal" onOpenChange={(_, d) => !d.open && close()}>
      <ResizableSurface sizeKey="templateManager" min={{ w: 760, h: 480 }} className={s.surface}>
        <DialogBody className={s.body}>
          <div className={s.title}>
            <DialogTitle className={s.titleText}>{t('テンプレート', 'Templates')}</DialogTitle>
            <Button appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={close} />
          </div>
          <div ref={boxRef} className={s.content}>
            <TemplateManager inline {...props} />
          </div>
        </DialogBody>
      </ResizableSurface>
    </Dialog>
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
