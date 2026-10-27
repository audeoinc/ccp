// 大きな作業のフロート(題の行・閉じる ×・画面いっぱいの切り替え + 中身)。テンプレートの管理・編集で使う(T11。2026-10-27)。
// 大きさを変えられ・題の行で動かせ・大きさを覚えるのは ResizableSurface。ここは「画面いっぱいまで広げる」と題の行の並びをまとめる
import { useState, type ReactNode } from 'react'
import { Button, Dialog, DialogBody, DialogTitle, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { DismissRegular, FullScreenMaximizeRegular, FullScreenMinimizeRegular } from '@fluentui/react-icons'
import { ResizableSurface } from './ResizableSurface'
import { loadPref, savePref } from './settings'
import { useT } from './i18n'

const useStyles = makeStyles({
  // 既定の幅は 1360px まで。広げた大きさ(ResizableSurface の width)を止めないよう、maxWidth は付けない
  surface: { width: 'min(1360px, calc(96vw / var(--ui-zoom, 1)))', maxWidth: 'none', height: 'calc(86vh / var(--ui-zoom, 1))', maxHeight: 'none', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  body: { display: 'flex', flexDirection: 'column', rowGap: 0, flexGrow: 1, minHeight: 0, padding: 0 },
  title: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS, padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  titleText: { flexGrow: 1, minWidth: 0 },
})

interface Props {
  /** 大きさ・画面いっぱいを覚える鍵(ResizableSurface の sizeKey) */
  sizeKey: string
  title: ReactNode
  onClose: () => void
  min?: { w: number; h: number }
  children: ReactNode
}

/** 大きな作業のフロート。題の行の右に「画面いっぱい / 元の大きさ」と閉じる。画面いっぱいかどうかも覚える */
export function BigFloat({ sizeKey, title, onClose, min = { w: 760, h: 480 }, children }: Props) {
  const s = useStyles()
  const t = useT()
  const maxKey = `float.${sizeKey}.max`
  const [max, setMax] = useState(() => loadPref<boolean>(maxKey, false))
  const toggle = () => {
    savePref(maxKey, !max)
    setMax(!max)
  }
  const label = max ? t('元の大きさに戻す', 'Restore size') : t('画面いっぱいに広げる', 'Fill the screen')
  return (
    <Dialog open modalType="modal" onOpenChange={(_, d) => !d.open && onClose()}>
      <ResizableSurface sizeKey={sizeKey} min={min} maximized={max} className={s.surface}>
        <DialogBody className={s.body}>
          <div className={s.title}>
            <DialogTitle className={s.titleText}>{title}</DialogTitle>
            <Tooltip content={label} relationship="label">
              <Button appearance="subtle" icon={max ? <FullScreenMinimizeRegular /> : <FullScreenMaximizeRegular />} onClick={toggle} />
            </Tooltip>
            <Button appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={onClose} />
          </div>
          {children}
        </DialogBody>
      </ResizableSurface>
    </Dialog>
  )
}
