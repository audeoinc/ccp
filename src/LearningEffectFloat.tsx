// 配信カードの学びの「効き目を見る」のフロート(2026-10-26 利用者: 効き目を、ページを移らずに見たい)。
// 根拠の「結果を見る」と同じく、配信カードを閉じずに上に重ねる。中身は、結果の面の「④ 学びの評価」の右の欄と同じ部品(LearningEffect)
import { Button, Caption1, Dialog, DialogActions, DialogBody, DialogContent, DialogTitle, makeStyles, tokens } from '@fluentui/react-components'
import { typo } from './typo'
import { DismissRegular, OpenRegular } from '@fluentui/react-icons'
import { ResizableSurface } from './ResizableSurface'
import { LearningEffect } from './ImpactView'
import { StrengthDots } from './LearningCard'
import type { LearningCardData } from './learningCards'
import { useT } from './i18n'

const useStyles = makeStyles({
  surface: { width: 'min(460px, (96vw / var(--ui-zoom, 1)))', maxWidth: 'none', height: 'min(640px, calc(88vh / var(--ui-zoom, 1)))', display: 'flex', flexDirection: 'column' },
  body: { display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0, flex: 1 },
  title: { display: 'flex', alignItems: 'center', gap: '8px' },
  titleText: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  content: { display: 'grid', alignContent: 'start', rowGap: '10px', overflowY: 'auto', minHeight: 0, flex: 1, justifyItems: 'stretch' },
  strength: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: tokens.fontSizeBase200 },
  label: typo.pairLabel,
  note: { color: tokens.colorNeutralForeground3 },
})

interface Props {
  learning: LearningCardData
  onClose: () => void
  /** 渡した配信・比べた相手の結果を、さらに上に重ねて開く(配信カードの「結果を見る」と同じ) */
  onOpenResult: (cardId: string) => void
  /** 結果の面の「④ 学びの評価」で、この学びを選んで開く(配信カードは閉じる) */
  onOpenFull: () => void
}

export function LearningEffectFloat({ learning: l, onClose, onOpenResult, onOpenFull }: Props) {
  const s = useStyles()
  const t = useT()
  return (
    <Dialog open modalType="non-modal" onOpenChange={(_, d) => !d.open && onClose()}>
      <ResizableSurface sizeKey="learningEffect" min={{ w: 360, h: 320 }} className={s.surface} aria-label={t('学びの効き目', 'Learning impact')}>
        <DialogBody className={s.body}>
          <div className={s.title}>
            <DialogTitle className={s.titleText} action={null}>
              {t(`効き目: ${l.title || '(名前なし)'}`, `Impact: ${l.title || '(untitled)'}`)}
            </DialogTitle>
            <Button appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={onClose} />
          </div>
          <DialogContent className={s.content}>
            <span className={s.strength}>
              <span className={s.label}>{t('強さ', 'Strength')}</span>
              <StrengthDots strength={l.strength} />
            </span>
            <LearningEffect on={l.effect} onOpenResult={onOpenResult} />
            {/* 結果の面は期間で絞れるが、ここは学びのカードと同じく、すべての配信で比べる(数字がカードの強さと食い違わないように) */}
            <Caption1 className={s.note}>
              {t('すべての期間の配信で比べています。期間を絞って比べるときや、扱い(残す・外す)を決めるときは、結果の画面で開きます。', 'Compared across all periods. To narrow the period or decide whether to keep or retire it, open it in Results.')}
            </Caption1>
          </DialogContent>
          <DialogActions>
            <Button size="small" icon={<OpenRegular />} onClick={onOpenFull}>
              {t('結果の画面で開く', 'Open in Results')}
            </Button>
          </DialogActions>
        </DialogBody>
      </ResizableSurface>
    </Dialog>
  )
}
