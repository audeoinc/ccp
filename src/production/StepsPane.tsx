// 左のバーの「工程」(X86 の ①。FEATURE_FLAGS の prod.steps)。① 渡す → ② 受け取る → ③ 制作する → ④ 仕上がりの確認 → ⑤ 送る の道のりと、
// 済んだ段のだれがいつ。いまの段のボタンは、だれの番でもここから押せる(題の行には、自分の番のときだけ出す)。いちばん新しく終えた段は「やり直す」(渡した段は「取り下げる」)
import { Button, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowUndoRegular, CheckmarkRegular } from '@fluentui/react-icons'
import { useT } from '../i18n'
import { StepAction } from './StepAction'
import type { ProductionFlow } from './useProductionFlow'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '8px', padding: '12px', alignContent: 'start' },
  step: { display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)', columnGap: '8px', padding: '8px 10px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, color: tokens.colorNeutralForeground3 },
  current: { borderTopColor: tokens.colorBrandStroke1, borderRightColor: tokens.colorBrandStroke1, borderBottomColor: tokens.colorBrandStroke1, borderLeftColor: tokens.colorBrandStroke1, backgroundColor: tokens.colorBrandBackground2, color: tokens.colorNeutralForeground1 },
  done: { color: tokens.colorNeutralForeground2 },
  dot: { width: '22px', height: '22px', borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: '12px', border: `1px solid ${tokens.colorNeutralStroke1}` },
  dotCurrent: { backgroundColor: tokens.colorBrandBackground, color: tokens.colorNeutralForegroundOnBrand, border: 'none' },
  dotDone: { backgroundColor: tokens.colorPaletteGreenBackground2, color: tokens.colorPaletteGreenForeground2, border: 'none' },
  body: { display: 'grid', rowGap: '4px', minWidth: 0 },
  name: { fontWeight: tokens.fontWeightSemibold, fontSize: '13px' },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, overflowWrap: 'anywhere' },
  error: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1 },
})

export function StepsPane({ flow, onViewResult, needMe }: { flow: ProductionFlow; onViewResult?: () => void; needMe?: string | null }) {
  const s = useStyles()
  const t = useT()
  const roleName = (side: 'planner' | 'production') => (side === 'planner' ? t('企画', 'Planner') : t('制作', 'Production'))
  return (
    <div className={s.root}>
      {!flow.approved && <span className={s.note}>{t('承認されたら、① から始めます', 'Start from step 1 after approval')}</span>}
      {flow.steps.map((st, i) => {
        const at = st.skipped ? 'skipped' : i < flow.current ? 'done' : i === flow.current ? 'current' : 'todo'
        return (
          <div key={st.key} className={mergeClasses(s.step, at === 'current' && s.current, (at === 'done' || at === 'skipped') && s.done)}>
            <span className={mergeClasses(s.dot, at === 'current' && s.dotCurrent, at === 'done' && s.dotDone)}>{at === 'done' ? <CheckmarkRegular /> : i + 1}</span>
            <span className={s.body}>
              <span className={s.name}>{st.name}</span>
              <span className={s.note}>{at === 'skipped' ? t('飛ばした(制作を通さずに送った)', 'Skipped (sent without production)') : st.info || [roleName(st.side), st.who].filter(Boolean).join(' · ')}</span>
              {at === 'current' && <StepAction flow={flow} step={st} onViewResult={onViewResult} needMe={needMe} />}
              {i === flow.current - 1 && flow.canUndo && (
                <span>
                  <Button size="small" appearance="transparent" icon={<ArrowUndoRegular />} disabled={flow.busy || !!needMe} onClick={() => void flow.act.undo()}>
                    {i === 0 ? t('取り下げる', 'Withdraw') : t('やり直す', 'Redo')}
                  </Button>
                </span>
              )}
            </span>
          </div>
        )
      })}
      {flow.error && <span className={s.error}>{flow.error}</span>}
    </div>
  )
}
