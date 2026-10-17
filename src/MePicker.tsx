import { useEffect, useSyncExternalStore } from 'react'
import { Dropdown, Input, Option, makeStyles, mergeClasses } from '@fluentui/react-components'
import { PersonRegular } from '@fluentui/react-icons'
import { useT } from './i18n'
import { myName, myUserId, onMeChange, setMe, setMyName } from './history'
import { activeUsers, usePeople } from './people'

const useStyles = makeStyles({
  // Dropdown は、中の文字の長さで幅が変わるので、置き場所の幅に合わせる
  dropdown: { minWidth: 0 },
})

interface Props {
  className?: string
  /** 選んだ(入れた)名前を、置き場所でも使うとき */
  onChange?: (name: string) => void
  /** 読み上げ用の名前(何に使う名前か) */
  ariaLabel?: string
  /** 名前を入れる形のときの、候補の datalist の id */
  list?: string
}

const subscribe = (f: () => void) => onMeChange(f)

/**
 * 「あなた」を選ぶ欄(バックログ U2)。ユーザーマスタに人がいれば、その中から選ぶ。
 * 1 人も登録されていない(または読めない)ときは、これまでどおり名前を入れる(いまの運用を止めないため)。
 * 選んだ人は、ブラウザごとに覚え、週の帯・配信カード・コメントで共通にする
 */
export function MePicker({ className, onChange, ariaLabel, list }: Props) {
  const styles = useStyles()
  const t = useT()
  const people = usePeople()
  const name = useSyncExternalStore(subscribe, myName)
  const userId = useSyncExternalStore(subscribe, myUserId)
  const users = activeUsers(people)
  const picked = users.find((u) => u.id === userId)

  // ユーザーマスタで名前を変えたら、覚えている名前もそろえる(履歴に、古い名前で残らないように)
  useEffect(() => {
    if (picked && picked.name !== name) setMe(picked)
  }, [picked, name])

  const label = ariaLabel ?? t('あなた(履歴に残す名前)', 'You (name for the history)')
  if (!people.loaded || users.length === 0) {
    return (
      <Input
        size="small"
        className={className}
        list={list}
        contentBefore={<PersonRegular />}
        placeholder={t('あなたの名前', 'Your name')}
        aria-label={label}
        value={name}
        onChange={(_, d) => {
          setMyName(d.value)
          onChange?.(d.value)
        }}
      />
    )
  }
  return (
    <Dropdown
      size="small"
      className={mergeClasses(styles.dropdown, className)}
      value={picked?.name ?? ''}
      placeholder={t('あなたは?', 'Who are you?')}
      aria-label={label}
      selectedOptions={picked ? [picked.id] : []}
      onOptionSelect={(_, d) => {
        const u = users.find((x) => x.id === d.optionValue)
        if (!u) return
        setMe(u)
        onChange?.(u.name)
      }}
    >
      {users.map((u) => (
        <Option key={u.id} value={u.id} text={u.name}>
          {u.name}
        </Option>
      ))}
    </Dropdown>
  )
}
