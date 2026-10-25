import type { ReactNode } from 'react'
import { Button, makeStyles, tokens } from '@fluentui/react-components'
import { ChevronLeftRegular } from '@fluentui/react-icons'
import { useT } from './i18n'

const useStyles = makeStyles({
  rail: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    rowGap: '10px',
    paddingTop: '6px',
    minHeight: 0,
    height: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
    cursor: 'pointer',
    backgroundColor: tokens.colorNeutralBackground2,
    ':hover': { backgroundColor: tokens.colorNeutralBackground2Hover },
  },
  label: { writingMode: 'vertical-rl', color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, letterSpacing: '0.1em' },
})

/**
 * たたんだペインの細い帯(整理 #11。配信カードの商品情報・プロセス、シンプルの商品の一覧、制作のページの 2 つで、4 通りあったのを 1 つに)。
 * 上の Fluent のボタン(‹)か、帯の空いた所を押すと開く。children は、ペインの名前の下に並べる印(状態・商品の点など。中にボタンを置いてよい)
 */
export function PaneRail({ label, onOpen, title, children }: { label: string; onOpen: () => void; title?: string; children?: ReactNode }) {
  const t = useT()
  const s = useStyles()
  return (
    <div
      className={s.rail}
      title={title}
      // 帯の中のボタン(商品の点など)を押したときは、開かない(そのボタンの動きだけにする)
      onClick={(e) => !(e.target as HTMLElement).closest('button, a') && onOpen()}
    >
      <Button type="button" size="small" appearance="subtle" icon={<ChevronLeftRegular />} onClick={onOpen} aria-label={t(`${label}を開く`, `Open ${label}`)} />
      <span className={s.label}>{label}</span>
      {children}
    </div>
  )
}
