import { useState } from 'react'
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { CheckmarkCircleRegular, ChevronDownRegular, ChevronUpRegular, ErrorCircleRegular, WarningRegular } from '@fluentui/react-icons'
import { useT } from '../i18n'
import { readinessIssues, type ReadinessItem, type ReadinessTarget } from './readiness'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '2px', padding: '8px 10px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  head: { display: 'flex', alignItems: 'center', columnGap: '6px', padding: '2px 0', border: 'none', backgroundColor: 'transparent', fontFamily: 'inherit', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1, cursor: 'pointer', textAlign: 'left' },
  grow: { flexGrow: 1, minWidth: 0 },
  row: {
    display: 'grid',
    gridTemplateColumns: '18px auto minmax(0, 1fr)',
    columnGap: '6px',
    alignItems: 'center',
    minHeight: '24px',
    padding: '1px 4px',
    border: 'none',
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    textAlign: 'left',
  },
  link: { cursor: 'pointer', ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  label: { fontWeight: tokens.fontWeightSemibold, whiteSpace: 'nowrap' },
  detail: { color: tokens.colorNeutralForeground3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  icon: { fontSize: '16px' },
  ok: { color: tokens.colorPaletteGreenForeground1 },
  warn: { color: tokens.colorPaletteMarigoldForeground1 },
  block: { color: tokens.colorPaletteRedForeground1 },
  count: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightRegular, color: tokens.colorNeutralForeground3 },
})

/**
 * 送る前の確かめの一覧(承認・渡すもののパネルのいちばん上に、常に出す)。警告も止めるものもなければ「すべて確かめました ✓」の 1 行に畳む。
 * 行を押すと、その部品(欄)を選ぶ。止めるものは赤、警告は黄、済みは緑(色だけにせず、印の形も変える)
 */
export function ReadinessList({ items, onPick }: { items: ReadinessItem[]; onPick: (target: ReadinessTarget) => void }) {
  const t = useT()
  const s = useStyles()
  const issues = readinessIssues(items)
  // 畳んでいるのは、気になる所がないときだけ(あるときは、開いたまま)
  const [open, setOpen] = useState(false)
  const shown = issues > 0 || open
  const icon = (i: ReadinessItem) =>
    i.level === 'block' ? <ErrorCircleRegular className={mergeClasses(s.icon, s.block)} /> : i.level === 'warn' ? <WarningRegular className={mergeClasses(s.icon, s.warn)} /> : <CheckmarkCircleRegular className={mergeClasses(s.icon, s.ok)} />
  const levelText = (i: ReadinessItem) => (i.level === 'block' ? t('入れないと進めません', 'Required') : i.level === 'warn' ? t('確認してください', 'Check this') : t('済み', 'Done'))
  return (
    <div className={s.root} role="group" aria-label={t('送る前の確認', 'Pre-send checks')}>
      {issues === 0 ? (
        <button type="button" className={s.head} onClick={() => setOpen(!open)} aria-expanded={open}>
          <CheckmarkCircleRegular className={mergeClasses(s.icon, s.ok)} />
          <span className={s.grow}>{t('すべて確認しました', 'All checks passed')}</span>
          {open ? <ChevronUpRegular /> : <ChevronDownRegular />}
        </button>
      ) : (
        <span className={s.head} style={{ cursor: 'default' }}>
          <WarningRegular className={mergeClasses(s.icon, items.some((i) => i.level === 'block') ? s.block : s.warn)} />
          <span className={s.grow}>
            {t('送る前の確認', 'Before you send')} <span className={s.count}>{t(`${issues} 件`, `${issues}`)}</span>
          </span>
        </span>
      )}
      {shown &&
        items.map((i) => {
          const target = i.target
          const body = (
            <>
              <span aria-label={levelText(i)} role="img" style={{ display: 'inline-flex' }}>{icon(i)}</span>
              <span className={s.label}>{i.label}</span>
              <span className={s.detail} title={i.detail}>{i.detail}</span>
            </>
          )
          return target ? (
            <button key={i.key} type="button" className={mergeClasses(s.row, s.link)} onClick={() => onPick(target)}>
              {body}
            </button>
          ) : (
            <span key={i.key} className={s.row}>
              {body}
            </span>
          )
        })}
    </div>
  )
}
