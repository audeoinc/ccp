import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  Avatar,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Menu,
  MenuDivider,
  MenuGroup,
  MenuGroupHeader,
  MenuItem,
  MenuItemRadio,
  MenuList,
  MenuPopover,
  MenuTrigger,
  makeStyles,
  mergeClasses,
  tokens,
  Tooltip,
} from '@fluentui/react-components'
import { ChevronDownRegular, PersonRegular, SignOutRegular } from '@fluentui/react-icons'
import { useT } from './i18n'
import { meLock, myName, myUserId, onMeChange, setMe, setMyName } from './history'
import { activeUsers, groupsOf, usePeople, type People } from './people'

const useStyles = makeStyles({
  // アカウントの見た目(頭文字の顔 + 名前)。幅は置き場所が決めるので、長い名前は省略する
  account: { minWidth: 0, maxWidth: '100%', justifyContent: 'flex-start', columnGap: '6px', fontWeight: tokens.fontWeightRegular },
  name: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  placeholder: { color: tokens.colorNeutralForeground3 },
  // ログインしている人は選び直せないので、名前だけ出す
  fixed: { display: 'inline-flex', alignItems: 'center', columnGap: '6px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  unregistered: { color: tokens.colorPaletteDarkOrangeForeground1 },
  menuNote: { padding: '4px 10px 6px', maxWidth: '260px', fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  // 初回のダイアログ
  surface: { maxWidth: '420px' },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  list: { display: 'grid', rowGap: '4px', marginTop: '10px', maxHeight: '360px', overflowY: 'auto' },
  pick: { justifyContent: 'flex-start', columnGap: '10px', padding: '6px 8px', fontWeight: tokens.fontWeightRegular },
  pickText: { display: 'grid', textAlign: 'left' },
  pickMeta: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
})

interface Props {
  className?: string
  /** 読み上げ用の名前 */
  ariaLabel?: string
}

const subscribe = (f: () => void) => onMeChange(f)

/** 入っている承認グループの名前(切り替えのとき、だれとして承認できるかの目安に) */
const groupNames = (people: People, userId: string) =>
  groupsOf(people, userId)
    .map((id) => people.groups.find((g) => g.id === id)?.name)
    .filter(Boolean)
    .join('・')

/**
 * ヘッダーの右上の「あなた」= ログインしている人(バックログ U9)。ほかの画面では人を選ばせず、ここで選んだ人で記録する。
 * ユーザーが登録されていれば、アカウントの見た目(頭文字の顔 + 名前)にし、押すと「ユーザーを切り替える(デモ)」で選び直せる
 * (本物のログインがまだないあいだの見本の機能。ログイン(U7。meLock)が入ったら、切り替えのメニューが消えるだけにする)。
 * 1 人も登録されていない(または読めない)ときは、これまでどおり名前を入れる(いまの運用を止めないため)。
 * 選んだ人は、ブラウザごとに覚える
 */
export function MePicker({ className, ariaLabel }: Props) {
  const styles = useStyles()
  const t = useT()
  const people = usePeople()
  const name = useSyncExternalStore(subscribe, myName)
  const userId = useSyncExternalStore(subscribe, myUserId)
  const lock = useSyncExternalStore(subscribe, meLock)
  const users = activeUsers(people)
  const picked = users.find((u) => u.id === userId)

  // ユーザーマスタで名前を変えたら、覚えている名前もそろえる(履歴に、古い名前で残らないように)
  useEffect(() => {
    if (picked && picked.name !== name) setMe(picked)
  }, [picked, name])

  const label = ariaLabel ?? t('ログインしている人', 'Signed-in user')
  if (lock) {
    // ログインしている(U7): 選ばせない。登録のない人は、メールアドレスを出して知らせる
    const text = lock.registered ? (picked?.name ?? name) : lock.email
    const title = lock.registered ? t('ログインしている人(変えられません)', 'Signed in (cannot be changed)') : t('このメールアドレスは、ユーザーに登録されていません(⚙ →「ユーザーと承認グループ」)', 'This email is not a registered user (⚙ → Users and approval groups)')
    return (
      <span className={mergeClasses(styles.fixed, !lock.registered && styles.unregistered, className)} title={title} aria-label={label}>
        <Avatar size={24} name={text} color="colorful" />
        {text}
      </span>
    )
  }
  if (!people.loaded || users.length === 0) {
    const input = (
      <Input
        size="small"
        className={className}
        contentBefore={<PersonRegular />}
        placeholder={t('あなたの名前', 'Your name')}
        aria-label={label}
        value={name}
        onChange={(_, d) => setMyName(d.value)}
      />
    )
    // 読めたのに 1 人もいない(Workbench を初期データなしで始めた など): なぜ名前の入力なのかを知らせる
    return people.loaded ? (
      <Tooltip
        content={t('ユーザーが登録されていないため、名前を入れる形になっています。⚙ →「ユーザーと承認グループ」で登録すると、選んでログインできます', 'No users are registered, so you type a name. Register users in ⚙ → Users and approval groups to pick who signs in.')}
        relationship="description"
      >
        {input}
      </Tooltip>
    ) : (
      input
    )
  }
  return (
    <Menu
      checkedValues={{ me: picked ? [picked.id] : [] }}
      onCheckedValueChange={(_, d) => {
        const u = users.find((x) => x.id === d.checkedItems[0])
        if (u) setMe(u)
      }}
    >
      <MenuTrigger disableButtonEnhancement>
        <Button
          appearance="subtle"
          size="small"
          className={mergeClasses(styles.account, className)}
          aria-label={label}
          icon={<Avatar size={24} name={picked?.name} color={picked ? 'colorful' : 'neutral'} />}
          iconPosition="before"
        >
          <span className={mergeClasses(styles.name, !picked && styles.placeholder)}>{picked?.name ?? t('ログインする人を選ぶ', 'Choose who signs in')}</span>
          <ChevronDownRegular />
        </Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          <MenuGroup>
            <MenuGroupHeader>{t('ユーザーを切り替える(デモ)', 'Switch user (demo)')}</MenuGroupHeader>
            {users.map((u) => (
              <MenuItemRadio key={u.id} name="me" value={u.id} secondaryContent={groupNames(people, u.id)}>
                {u.name}
              </MenuItemRadio>
            ))}
          </MenuGroup>
          <MenuDivider />
          {/* ログアウト(デモ): 覚えている人を消し、最初の「だれでログインしますか?」をもう一度出す */}
          <MenuItem icon={<SignOutRegular />} disabled={!picked} onClick={() => setMe(undefined)}>
            {t('ログアウト', 'Sign out')}
          </MenuItem>
          <div className={styles.menuNote}>
            {t('ログインが入るまでの見本の機能です。選んだ人として、依頼・承認・やり取りが記録されます。', 'A demo feature until sign-in is added. Requests, approvals and comments are recorded as the chosen person.')}
          </div>
        </MenuList>
      </MenuPopover>
    </Menu>
  )
}

/**
 * 初めて開いたとき(ユーザーが登録されていて、まだだれも選んでいない)に、だれでログインするかを選ぶダイアログ(U9)。
 * 右上で選ぶのと同じ。「あとで」で閉じても、このページを開き直すまでは出さない(作業を止めないため)
 */
export function SignInDialog() {
  const styles = useStyles()
  const t = useT()
  const people = usePeople()
  const userId = useSyncExternalStore(subscribe, myUserId)
  const lock = useSyncExternalStore(subscribe, meLock)
  const [later, setLater] = useState(false)
  // ログアウトしたら(覚えている人が消えたら)、「あとで」で閉じていても、もう一度出す
  const [seenId, setSeenId] = useState(userId)
  if (userId !== seenId) {
    setSeenId(userId)
    if (!userId) setLater(false)
  }
  const users = activeUsers(people)
  // 覚えている id のユーザーが無効・削除になっていたら、選び直してもらう
  const known = users.some((u) => u.id === userId)
  const open = !later && !lock && people.loaded && users.length > 0 && !known

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && setLater(true)}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>{t('だれでログインしますか?', 'Who is signing in?')}</DialogTitle>
          <DialogContent>
            <span className={styles.caption}>
              {t('ログインが入るまでの見本の機能です。選んだ人として、依頼・承認・やり取りが記録されます。あとから右上で切り替えられます。', 'A demo feature until sign-in is added. Requests, approvals and comments are recorded as the chosen person. You can switch later at the top right.')}
            </span>
            <div className={styles.list}>
              {users.map((u) => (
                <Button key={u.id} appearance="subtle" className={styles.pick} icon={<Avatar size={28} name={u.name} color="colorful" />} onClick={() => setMe(u)}>
                  <span className={styles.pickText}>
                    <span>{u.name}</span>
                    {groupNames(people, u.id) && <span className={styles.pickMeta}>{groupNames(people, u.id)}</span>}
                  </span>
                </Button>
              ))}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={() => setLater(true)}>
              {t('あとで', 'Later')}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
