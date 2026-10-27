// 試す → 確定の帯(trial.ts の useTrial と組で使う)
import { useEffect, useRef } from 'react'
import { Button, makeStyles, tokens } from '@fluentui/react-components'
import { typo } from './typo'
import { ArrowRightRegular, CheckmarkRegular } from '@fluentui/react-icons'
import { useT } from './i18n'
import type { useTrial } from './trial'

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: '8px',
    rowGap: '6px',
    padding: '6px 10px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorBrandStroke2}`,
    backgroundColor: tokens.colorBrandBackground2,
    fontSize: tokens.fontSizeBase200,
  },
  pair: { display: 'flex', alignItems: 'center', columnGap: '6px', flexGrow: 1, minWidth: 0, flexWrap: 'wrap' },
  label: { ...typo.label, flexShrink: 0 },
  value: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' },
  to: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  buttons: { display: 'flex', columnGap: '6px', marginLeft: 'auto' },
})

/** 「いま: ○○ → 試している: △△ [確定] [やめる]」の帯。試していなければ出さない。Enter で確定、Esc でやめる(文字の入力中は除く) */
export function TrialBar({ state }: { state: ReturnType<typeof useTrial> }) {
  const s = useStyles()
  const t = useT()
  const { trial, confirm, cancel } = state
  const keys = useRef({ confirm, cancel })
  useEffect(() => {
    keys.current = { confirm, cancel }
  })
  useEffect(() => {
    if (!trial) return
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      // 文字を書いている欄の Enter・Esc は、その欄のもの(AI への頼みごとを送るなど)
      if (el && (el.closest('input, textarea, [contenteditable=true], [role=combobox]') || e.isComposing)) return
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        keys.current.confirm()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        keys.current.cancel()
      }
    }
    // フロートの Esc(閉じる)より先に受ける
    window.addEventListener('keydown', on, true)
    return () => window.removeEventListener('keydown', on, true)
  }, [trial])
  if (!trial) return null
  return (
    <div className={s.bar} role="status" aria-live="polite">
      <span className={s.pair}>
        <span className={s.label}>{t('いま', 'Now')}</span>
        <span className={s.value} title={trial.from}>{trial.from || t('(空)', '(empty)')}</span>
        <ArrowRightRegular aria-hidden />
        <span className={s.label}>{t('試している', 'Trying')}</span>
        <span className={`${s.value} ${s.to}`} title={trial.to}>{trial.to}</span>
      </span>
      <span className={s.buttons}>
        <Button size="small" appearance="primary" icon={<CheckmarkRegular />} onClick={confirm} title={t('Enter でも確定します', 'Press Enter to apply')}>
          {t('確定', 'Apply')}
        </Button>
        <Button size="small" onClick={cancel} title={t('Esc でもやめられます', 'Press Esc to cancel')}>
          {t('やめる', 'Cancel')}
        </Button>
      </span>
    </div>
  )
}
