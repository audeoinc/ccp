// 一覧の見出しと「＋ ○○を足す」(2026-10-23 利用者と決めた画面の部品の決まり 1。CLAUDE.md・ARCHITECTURE の「見た目の約束事」)。
// 足すボタンは、どの一覧でも見出しの右に置く(一覧の下だと、行が増えるほど遠くなり、場所も画面ごとにばらばらになるため)。
// 足した行の印と並びは useJustAdded(./useJustAdded)
import type { ReactElement, ReactNode } from 'react'
import { Badge, Button, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { AddRegular } from '@fluentui/react-icons'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '2px', minWidth: 0 },
  // 見出し 13px・中太(文字の階層)
  head: { display: 'flex', alignItems: 'center', columnGap: '8px', minHeight: '28px', fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1, minWidth: 0 },
  title: { display: 'inline-flex', alignItems: 'center', columnGap: '8px', minWidth: 0 },
  // 足すボタンとほかの操作は、右に寄せる
  right: { marginLeft: 'auto', display: 'flex', alignItems: 'center', columnGap: '4px', flexShrink: 0 },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, lineHeight: tokens.lineHeightBase200 },
})

export interface AddChoice {
  key: string
  label: string
  icon?: ReactElement
  onSelect: () => void
}

interface Props {
  title: ReactNode
  icon?: ReactNode
  /** 見出しの横の数 */
  count?: number
  /** 見出しの下の補足 */
  caption?: ReactNode
  /** 足すボタンの文言(「タスクを足す」のように、「○○を足す」。「追加」とは書かない)。省くとボタンを出さない */
  addLabel?: string
  /** 足すボタンを押したとき(choices を渡したときは使わない) */
  onAdd?: () => void
  /** 足し方が複数あるとき(ファイル / URL など)。足すボタンがメニューを開く */
  choices?: AddChoice[]
  addDisabled?: boolean
  /** 足している最中(ボタンの印を回す) */
  busy?: boolean
  /** 足すボタンの左に並べる、ほかの操作 */
  actions?: ReactNode
}

/** 一覧の見出し。右に「＋ ○○を足す」 */
export function ListHeader({ title, icon, count, caption, addLabel, onAdd, choices, addDisabled, busy, actions }: Props) {
  const s = useStyles()
  const addButton = addLabel && (
    <Button size="small" appearance="subtle" icon={busy ? <Spinner size="extra-tiny" /> : <AddRegular />} disabled={addDisabled || busy} onClick={choices ? undefined : onAdd}>
      {addLabel}
    </Button>
  )
  return (
    <div className={s.root}>
      <div className={s.head}>
        <span className={s.title}>
          {icon}
          {title}
          {count !== undefined && count > 0 && (
            <Badge appearance="tint" size="small">
              {count}
            </Badge>
          )}
        </span>
        <span className={s.right}>
          {actions}
          {addButton &&
            (choices ? (
              <Menu>
                <MenuTrigger disableButtonEnhancement>{addButton}</MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    {choices.map((c) => (
                      <MenuItem key={c.key} icon={c.icon} onClick={c.onSelect}>
                        {c.label}
                      </MenuItem>
                    ))}
                  </MenuList>
                </MenuPopover>
              </Menu>
            ) : (
              addButton
            ))}
        </span>
      </div>
      {caption && <div className={s.caption}>{caption}</div>}
    </div>
  )
}
