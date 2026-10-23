import { useEffect, useState } from 'react'
import {
  Badge,
  Button,
  Dialog,
  DialogTitle,
  Dropdown,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  Select,
  Spinner,
  Tab,
  TabList,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import { ResizableSurface } from './ResizableSurface'
import { ListHeader } from './ListHeader'
import { useJustAdded } from './useJustAdded'
import { AddRegular, DismissRegular } from '@fluentui/react-icons'
import { locale, optionLabel, tr, useT } from './i18n'
import { logEvent, meLock, myName, myUserId, onMeChange } from './history'
import { useSyncExternalStore } from 'react'
import { activeUsers, groupCountries, groupInCountry, groupUsers, reloadPeople, ruleFor, setPeopleManagerOpen as setOpen, usePeople, usePeopleManagerOpen } from './people'
import { countryOptions } from './status'
import { UsersService } from './data/users'
import { ApprovalGroupsService } from './data/approvalGroups'
import { ApprovalGroupMembersService } from './data/approvalGroupMembers'
import { ApprovalRulesService } from './data/approvalRules'
import { ApprovalRuleRule, type ApprovalRule } from './models/approvalRules'
import { parseIds } from './approvals'
import { EventsService, type CardEvent } from './data/events'
import { UserRole, UserStatus, type User, type UserFields } from './models/users'
import { ApprovalGroupStatus, type ApprovalGroup } from './models/approvalGroups'

const useStyles = makeStyles({
  surface: { width: 'min(880px, (96vw / var(--ui-zoom, 1)))', maxWidth: 'none', maxHeight: 'calc(90vh / var(--ui-zoom, 1))', display: 'flex', flexDirection: 'column', rowGap: '12px' },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px' },
  grow: { flexGrow: 1 },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  scroll: { overflowY: 'auto', minHeight: '240px', display: 'grid', rowGap: '8px', alignContent: 'start' },
  grid: { display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(180px, 1.4fr) 120px 100px', columnGap: '8px', rowGap: '6px', alignItems: 'center' },
  colHead: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  // 見出しの「＋ ○○を足す」で開く足す欄(一覧の上)
  addRow: { display: 'flex', columnGap: '8px', alignItems: 'center', flexWrap: 'wrap', padding: '8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
  // ユーザーの 1 行(表の列にそろえたまま、行ごとに足したばかりの印を付けられるように、subgrid で包む)
  userRow: { gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'subgrid', alignItems: 'center', borderRadius: tokens.borderRadiusMedium },
  group: { display: 'grid', rowGap: '6px', padding: '10px 12px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}` },
  groupHead: { display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(180px, 2fr) 100px', columnGap: '8px', alignItems: 'center' },
  members: { display: 'flex', flexWrap: 'wrap', columnGap: '6px', rowGap: '6px', alignItems: 'center' },
  label: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  history: { display: 'grid', rowGap: '6px', fontSize: tokens.fontSizeBase200 },
  historyRow: { display: 'grid', rowGap: '1px', paddingBottom: '6px', borderBottom: `1px solid ${tokens.colorNeutralStroke3}` },
  meta: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  inactive: { color: tokens.colorNeutralForeground4 },
})

type TabKey = 'users' | 'groups' | 'rules' | 'history'

const roleOptions = Object.entries(UserRole) as [keyof typeof UserRole, string][]
const statusOptions = Object.entries(UserStatus) as [keyof typeof UserStatus, string][]
const groupStatusOptions = Object.entries(ApprovalGroupStatus) as [keyof typeof ApprovalGroupStatus, string][]
const ruleOptions = Object.entries(ApprovalRuleRule) as [keyof typeof ApprovalRuleRule, string][]

const looksLikeEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)

/**
 * ユーザーと承認グループ(バックログ U1。docs/APPROVAL.md)。⚙ のメニューから開く。
 * ログインが入るまでは、だれでも編集できる。そのかわり、変更はすべて操作の履歴に残し、ここの「変更の履歴」で見られるようにする
 */
export function PeopleManager() {
  const isOpen = usePeopleManagerOpen()
  const s = useStyles()
  const t = useT()
  const people = usePeople()
  const [tab, setTab] = useState<TabKey>('users')
  // 承認の決まりを見る・変える国(ST4。空は共通)
  const [ruleCountry, setRuleCountry] = useState('')
  const [working, setWorking] = useState(false)
  // ログインしているとき(U7)は、管理者だけが編集できる。ログインがなければ、だれでも(いまの運用。変更は履歴に残る)
  const lock = useSyncExternalStore(onMeChange, meLock)
  const meId = useSyncExternalStore(onMeChange, myUserId)
  const meName = useSyncExternalStore(onMeChange, myName)
  const canEdit = !lock || people.users.find((u) => u.id === meId)?.role === 'admin'
  const busy = working || !canEdit
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<CardEvent[] | null>(null)
  // 足すユーザー・グループの入力
  const [newUser, setNewUser] = useState({ name: '', email: '' })
  const [newGroup, setNewGroup] = useState({ name: '', description: '' })
  const [adding, setAdding] = useState<null | 'user' | 'group'>(null)
  const justAdded = useJustAdded()
  const clearAdded = justAdded.clear

  const loadLog = async () => {
    const r = await EventsService.getAll({ orderBy: ['created_on desc'] })
    setLog(r.success ? (r.data ?? []).filter((e) => e.action === 'user_change' || e.action === 'group_change' || e.action === 'rule_change') : [])
  }
  useEffect(() => {
    if (!isOpen) return
    // 開き直したら、いつもの並び(名前の順)に戻し、足す欄も閉じる
    clearAdded()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAdding(null)
    void reloadPeople()
    // 開いたときに、変更の履歴を読み直す(ほかの人の変更も見えるように)
    void loadLog()
  }, [isOpen, clearAdded])

  /** 書き込み → 履歴に残す → 読み直す。失敗したら理由を出して、履歴は残さない */
  const run = async (write: () => Promise<{ success: boolean; error?: { message: string } }>, action: 'user_change' | 'group_change' | 'rule_change', note: string) => {
    setWorking(true)
    setError(null)
    try {
      const r = await write()
      if (!r.success) throw new Error(r.error?.message ?? tr('保存できませんでした', 'Could not save'))
      await logEvent({ action, note })
      await Promise.all([reloadPeople(), loadLog()])
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setWorking(false)
    }
  }

  const emailTaken = (email: string, except?: string) => people.users.some((u) => u.id !== except && (u.email ?? '').toLowerCase() === email.toLowerCase())
  const checkEmail = (email: string, except?: string): string | null =>
    email && !looksLikeEmail(email)
      ? t('メールアドレスの形が正しくありません', 'The email address does not look right')
      : email && emailTaken(email, except)
        ? t('同じメールアドレスのユーザーがいます', 'Another user has the same email address')
        : null

  const addUser = async () => {
    const name = newUser.name.trim()
    const email = newUser.email.trim()
    const bad = checkEmail(email)
    if (bad) return setError(bad)
    let id: string | undefined
    const ok = await run(
      async () => {
        const r = await UsersService.create({ name, email: email || undefined, role: 'member', status: 'active' })
        id = r.data?.id
        return r
      },
      'user_change',
      tr(`追加: ${name}`, `Added: ${name}`),
    )
    if (ok) {
      setNewUser({ name: '', email: '' })
      justAdded.mark(id)
    }
  }

  /** ユーザーの 1 項目を変える(入力欄は、離れたときに保存する) */
  const updateUser = (u: User, field: keyof UserFields, value: string) => {
    const v = value.trim()
    if ((u[field] ?? '') === v) return
    if (field === 'name' && !v) return setError(t('名前は空にできません', 'The name cannot be empty'))
    if (field === 'email') {
      const bad = checkEmail(v, u.id)
      if (bad) return setError(bad)
    }
    const shown = (x?: string) => (field === 'role' ? optionLabel(UserRole[x as keyof typeof UserRole]) : field === 'status' ? optionLabel(UserStatus[x as keyof typeof UserStatus]) : x) || '—'
    const what = { name: tr('名前', 'name'), email: tr('メールアドレス', 'email'), role: tr('役割', 'role'), status: tr('状態', 'status') }[field]
    void run(() => UsersService.update(u.id, { [field]: v || undefined }), 'user_change', tr(`${u.name} の${what}: ${shown(u[field])} → ${shown(v)}`, `${u.name} ${what}: ${shown(u[field])} → ${shown(v)}`))
  }

  const addGroup = async () => {
    const name = newGroup.name.trim()
    const description = newGroup.description.trim()
    let id: string | undefined
    const ok = await run(
      async () => {
        const r = await ApprovalGroupsService.create({ name, description: description || undefined, status: 'active' })
        id = r.data?.id
        return r
      },
      'group_change',
      tr(`追加: ${name}`, `Added: ${name}`),
    )
    if (ok) {
      setNewGroup({ name: '', description: '' })
      justAdded.mark(id)
    }
  }

  const updateGroup = (g: ApprovalGroup, field: 'name' | 'description' | 'status', value: string) => {
    const v = value.trim()
    if ((g[field] ?? '') === v) return
    if (field === 'name' && !v) return setError(t('名前は空にできません', 'The name cannot be empty'))
    const shown = (x?: string) => (field === 'status' ? optionLabel(ApprovalGroupStatus[x as keyof typeof ApprovalGroupStatus]) : x) || '—'
    const what = { name: tr('名前', 'name'), description: tr('説明', 'description'), status: tr('状態', 'status') }[field]
    void run(() => ApprovalGroupsService.update(g.id, { [field]: v || undefined }), 'group_change', tr(`${g.name} の${what}: ${shown(g[field])} → ${shown(v)}`, `${g.name} ${what}: ${shown(g[field])} → ${shown(v)}`))
  }

  // 承認する国(ST4)。空はすべての国。国を絞ると、ほかの国の配信の依頼先に出なくなる
  const countryName = (code: string) => optionLabel(countryOptions.find((o) => String(o.value) === code)?.label) || code
  const setGroupCountries = (g: ApprovalGroup, next: string[]) => {
    const shown = (list: string[]) => (list.length ? list.map(countryName).join(' / ') : tr('すべての国', 'all countries'))
    void run(() => ApprovalGroupsService.update(g.id, { countries: next.length ? JSON.stringify(next) : '' }), 'group_change', tr(`${g.name} の国: ${shown(groupCountries(g))} → ${shown(next)}`, `${g.name} countries: ${shown(groupCountries(g))} → ${shown(next)}`))
  }

  const addMember = (g: ApprovalGroup, u: User) =>
    void run(() => ApprovalGroupMembersService.create({ approval_group_id: g.id, user_id: u.id }), 'group_change', tr(`${g.name} に ${u.name} を足した`, `Added ${u.name} to ${g.name}`))

  const removeMember = (g: ApprovalGroup, u: User) => {
    const row = people.members.find((m) => m.approval_group_id === g.id && m.user_id === u.id)
    if (!row) return
    void run(
      async () => {
        await ApprovalGroupMembersService.delete(row.id)
        return { success: true }
      },
      'group_change',
      tr(`${g.name} から ${u.name} を外した`, `Removed ${u.name} from ${g.name}`),
    )
  }

  /**
   * 既定の承認者と決まり(U3)。すべての配信に同じ 1 つ(2026-10-19、利用者の判断: 配信カードの「種別」をやめた)。
   * 共通の行(department が空)に書く。まだなければ、いま使っている行(以前の種別ごとの行)を写して作る。変えた項目だけを書く
   */
  const saveRule = (patch: Partial<Pick<ApprovalRule, 'rule' | 'group_ids' | 'user_ids'>>, what: string) => {
    // 国を選んでいれば、その国の行(ST4)。まだなければ、いまその国で使っている決まり(共通)を写して作る
    const own = people.rules.find((r) => !r.department && (r.country ?? '') === ruleCountry)
    const base = ruleFor(people, ruleCountry || undefined)
    const write = () =>
      own
        ? ApprovalRulesService.update(own.id, patch)
        : ApprovalRulesService.create({ department: '', country: ruleCountry || undefined, rule: base?.rule ?? 'all', group_ids: base?.group_ids ?? '[]', user_ids: base?.user_ids ?? '[]', ...patch })
    const scope = ruleCountry ? countryName(ruleCountry) : tr('共通', 'common')
    void run(write, 'rule_change', tr(`既定(${scope}): ${what}`, `Default (${scope}): ${what}`))
  }

  // 国の決まりをやめて、共通に戻す(ST4)
  const dropCountryRule = () => {
    const own = people.rules.find((r) => !r.department && r.country === ruleCountry)
    if (!own || !window.confirm(t(`${countryName(ruleCountry)}の決まりをやめて、共通の決まりを使いますか?`, `Stop using a separate rule for ${countryName(ruleCountry)} and use the common rule?`))) return
    void run(
      async () => {
        await ApprovalRulesService.delete(own.id)
        return { success: true }
      },
      'rule_change',
      tr(`既定(${countryName(ruleCountry)}): 共通に戻した`, `Default (${countryName(ruleCountry)}): back to common`),
    )
  }

  const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

  const usersTab = (
    <>
      <ListHeader title={t('ユーザー', 'Users')} addLabel={t('ユーザーを足す', 'Add a user')} addDisabled={busy || adding === 'user'} onAdd={() => setAdding('user')} />
      {adding === 'user' && (
      <div className={s.addRow}>
        <Input size="small" autoFocus placeholder={t('名前', 'Name')} value={newUser.name} onChange={(_, d) => setNewUser((x) => ({ ...x, name: d.value }))} />
        <Input size="small" type="email" placeholder={t('メールアドレス(ログイン・通知に使う)', 'Email (for sign-in and notifications)')} value={newUser.email} onChange={(_, d) => setNewUser((x) => ({ ...x, email: d.value }))} style={{ minWidth: '260px' }} />
        <Button size="small" icon={<AddRegular />} disabled={busy || !newUser.name.trim()} onClick={() => void addUser()}>
          {t('足す', 'Add')}
        </Button>
        <Button size="small" onClick={() => setAdding(null)}>
          {t('閉じる', 'Close')}
        </Button>
      </div>
      )}
      <div className={s.grid}>
        <span className={s.colHead}>{t('名前', 'Name')}</span>
        <span className={s.colHead}>{t('メールアドレス', 'Email')}</span>
        <span className={s.colHead}>{t('役割', 'Role')}</span>
        <span className={s.colHead}>{t('状態', 'Status')}</span>
        {justAdded.order(people.users, (u) => u.id).map((u) => (
          // key に更新の時刻を含め、保存し直したら入力欄を、保存した値で作り直す(入れかけの値が残らないように)
          <div key={`${u.id}:${u.modified_on ?? ''}:${u.name}:${u.email ?? ''}`} className={mergeClasses(s.userRow, justAdded.freshClass(u.id))}>
            <UserRow user={u} disabled={busy} onChange={(f, v) => updateUser(u, f, v)} />
          </div>
        ))}
      </div>
      {people.loaded && people.users.length === 0 && <span className={s.note}>{t('まだユーザーがいません。上で足すと、「あなた」をユーザーから選べるようになります。', 'No users yet. Once you add some, "You" is chosen from the users.')}</span>}
    </>
  )

  const groupsTab = (
    <>
      <ListHeader title={t('承認グループ', 'Approval groups')} addLabel={t('グループを足す', 'Add a group')} addDisabled={busy || adding === 'group'} onAdd={() => setAdding('group')} />
      {adding === 'group' && (
      <div className={s.addRow}>
        <Input size="small" autoFocus placeholder={t('グループの名前(例: MD・ブランド)', 'Group name (e.g. MD, Brand)')} value={newGroup.name} onChange={(_, d) => setNewGroup((x) => ({ ...x, name: d.value }))} />
        <Input size="small" placeholder={t('何を見るグループか', 'What the group checks')} value={newGroup.description} onChange={(_, d) => setNewGroup((x) => ({ ...x, description: d.value }))} style={{ minWidth: '260px' }} />
        <Button size="small" icon={<AddRegular />} disabled={busy || !newGroup.name.trim()} onClick={() => void addGroup()}>
          {t('足す', 'Add')}
        </Button>
        <Button size="small" onClick={() => setAdding(null)}>
          {t('閉じる', 'Close')}
        </Button>
      </div>
      )}
      <span className={s.note}>{t('承認を依頼すると、グループのだれか 1 人が承認すれば、そのグループは済みになります。', 'When approval is requested from a group, one approval from any member completes that group.')}</span>
      {justAdded.order(people.groups, (g) => g.id).map((g) => {
        const inGroup = groupUsers(people, g.id)
        const candidates = activeUsers(people).filter((u) => !inGroup.some((x) => x.id === u.id))
        return (
          <div key={`${g.id}:${g.modified_on ?? ''}:${g.name}:${g.description ?? ''}`} className={mergeClasses(s.group, justAdded.freshClass(g.id))}>
            <div className={s.groupHead}>
              <Input size="small" defaultValue={g.name} aria-label={t('グループの名前', 'Group name')} disabled={busy} onBlur={(e) => updateGroup(g, 'name', e.target.value)} />
              <Input size="small" defaultValue={g.description ?? ''} placeholder={t('何を見るグループか', 'What the group checks')} aria-label={t('説明', 'Description')} disabled={busy} onBlur={(e) => updateGroup(g, 'description', e.target.value)} />
              <Select size="small" value={g.status ?? 'active'} aria-label={t('状態', 'Status')} disabled={busy} onChange={(_, d) => updateGroup(g, 'status', d.value)}>
                {groupStatusOptions.map(([v, l]) => (
                  <option key={v} value={v}>{optionLabel(l)}</option>
                ))}
              </Select>
            </div>
            <div className={s.members}>
              <span className={s.label}>{t('承認する国', 'Countries')}</span>
              <Dropdown
                size="small"
                multiselect
                placeholder={t('すべての国', 'All countries')}
                disabled={busy}
                value={groupCountries(g).map(countryName).join(', ')}
                selectedOptions={groupCountries(g)}
                onOptionSelect={(_, d) => setGroupCountries(g, d.selectedOptions)}
              >
                {countryOptions.map((o) => (
                  <Option key={o.value} value={String(o.value)} text={optionLabel(o.label)}>
                    {optionLabel(o.label)}
                  </Option>
                ))}
              </Dropdown>
            </div>
            <div className={s.members}>
              <span className={s.label}>{t(`メンバー ${inGroup.length} 人`, `${inGroup.length} member(s)`)}</span>
              {inGroup.map((u) => (
                <Button key={u.id} size="small" shape="circular" appearance="secondary" icon={<DismissRegular />} iconPosition="after" disabled={busy} title={t(`${u.name} をグループから外す`, `Remove ${u.name} from the group`)} onClick={() => removeMember(g, u)}>
                  {u.name}
                </Button>
              ))}
              {candidates.length > 0 && (
                <Dropdown
                  size="small"
                  placeholder={t('メンバーを足す', 'Add a member')}
                  value=""
                  selectedOptions={[]}
                  disabled={busy}
                  onOptionSelect={(_, d) => {
                    const u = candidates.find((x) => x.id === d.optionValue)
                    if (u) addMember(g, u)
                  }}
                >
                  {candidates.map((u) => (
                    <Option key={u.id} value={u.id} text={u.name}>{u.name}</Option>
                  ))}
                </Dropdown>
              )}
            </div>
          </div>
        )
      })}
      {people.loaded && people.groups.length === 0 && <span className={s.note}>{t('まだ承認グループがありません。', 'No approval groups yet.')}</span>}
    </>
  )

  const rulesTab = (
    <>
      <span className={s.note}>
        {t(
          '配信カードで「承認を依頼」を押したときの、最初の相手と決まりです(依頼のときに足し引きできます)。国ごとに決められます。国の決まりがなければ、共通の決まりを使います。全員 = 指名したそれぞれから 1 人ずつ、1 人 = だれか 1 人。',
          'The default approvers and rule when "Request approval" is pressed on a delivery card (adjustable per request). You can set them per country; countries without their own rule use the common one. Everyone = one from each; Any one = any single approver.',
        )}
      </span>
      <div className={s.members}>
        <span className={s.label}>{t('国', 'Country')}</span>
        <Select size="small" value={ruleCountry} onChange={(_, d) => setRuleCountry(d.value)}>
          <option value="">{t('共通(国の決まりがない国)', 'Common (countries without their own)')}</option>
          {countryOptions.map((o) => (
            <option key={o.value} value={String(o.value)}>
              {optionLabel(o.label)}
              {people.rules.some((r) => !r.department && r.country === String(o.value)) ? t('(国の決まり)', ' (own rule)') : ''}
            </option>
          ))}
        </Select>
        {ruleCountry &&
          (people.rules.some((r) => !r.department && r.country === ruleCountry) ? (
            <Button size="small" appearance="subtle" disabled={busy} onClick={dropCountryRule}>
              {t('共通に戻す', 'Use the common rule')}
            </Button>
          ) : (
            <span className={s.note}>{t('いまは共通の決まりを使っています。変えると、この国の決まりになります。', 'Uses the common rule now. Changing it creates a rule for this country.')}</span>
          ))}
      </div>
      {(() => {
        const r = ruleFor(people, ruleCountry || undefined)
        // その国を承認するグループだけを選べる(国を決めていないグループは、すべての国)
        const activeGroups = people.groups.filter((g) => (g.status ?? 'active') === 'active' && groupInCountry(g, ruleCountry || undefined))
        const users = activeUsers(people)
        const gids = parseIds(r?.group_ids)
        const uids = parseIds(r?.user_ids)
        return (
          <div className={s.group}>
            <div className={s.groupHead}>
              <span className={s.colHead}>{ruleCountry ? t(`${countryName(ruleCountry)}の配信`, `${countryName(ruleCountry)} deliveries`) : t('共通', 'Common')}</span>
              <Select size="small" value={r?.rule ?? 'all'} aria-label={t('決まり', 'Rule')} disabled={busy} onChange={(_, v) => saveRule({ rule: v.value as ApprovalRule['rule'] }, `${t('決まり', 'rule')} ${optionLabel(ApprovalRuleRule[v.value as keyof typeof ApprovalRuleRule])}`)}>
                {ruleOptions.map(([v, l]) => (
                  <option key={v} value={v}>{optionLabel(l)}</option>
                ))}
              </Select>
              <span />
            </div>
            <div className={s.members}>
              <span className={s.label}>{t('承認グループ', 'Groups')}</span>
              <Dropdown
                size="small"
                multiselect
                placeholder={t('選ぶ', 'Choose')}
                disabled={busy}
                value={activeGroups.filter((g) => gids.includes(g.id)).map((g) => g.name).join(', ')}
                selectedOptions={gids}
                onOptionSelect={(_, v) => saveRule({ group_ids: JSON.stringify(v.selectedOptions) }, `${t('グループ', 'groups')} ${activeGroups.filter((g) => v.selectedOptions.includes(g.id)).map((g) => g.name).join(' / ') || '—'}`)}
              >
                {activeGroups.map((g) => (
                  <Option key={g.id} value={g.id} text={g.name}>{g.name}</Option>
                ))}
              </Dropdown>
              <span className={s.label}>{t('承認者(人)', 'Approvers')}</span>
              <Dropdown
                size="small"
                multiselect
                placeholder={t('選ぶ', 'Choose')}
                disabled={busy}
                value={users.filter((u) => uids.includes(u.id)).map((u) => u.name).join(', ')}
                selectedOptions={uids}
                onOptionSelect={(_, v) => saveRule({ user_ids: JSON.stringify(v.selectedOptions) }, `${t('承認者', 'approvers')} ${users.filter((u) => v.selectedOptions.includes(u.id)).map((u) => u.name).join(' / ') || '—'}`)}
              >
                {users.map((u) => (
                  <Option key={u.id} value={u.id} text={u.name}>{u.name}</Option>
                ))}
              </Dropdown>
            </div>
          </div>
        )
      })()}
    </>
  )

  const historyTab = (
    <div className={s.history}>
      {log === null && <Spinner size="tiny" />}
      {log?.length === 0 && <span className={s.note}>{t('まだ記録はありません', 'Nothing recorded yet')}</span>}
      {log?.map((e) => (
        <div key={e.id} className={s.historyRow}>
          <span className={s.meta}>{`${when(e.created_on)} · ${e.actor || t('(名前なし)', '(no name)')} · ${e.action === 'user_change' ? t('ユーザー', 'User') : e.action === 'rule_change' ? t('承認の決まり', 'Approval rule') : t('承認グループ', 'Approval group')}`}</span>
          <span>{e.note}</span>
        </div>
      ))}
    </div>
  )

  return (
    <Dialog open={isOpen} onOpenChange={(_, d) => !d.open && setOpen(false)}>
      <ResizableSurface sizeKey="people" className={s.surface}>
        <div className={s.head}>
          <DialogTitle className={s.grow}>{t('ユーザーと承認グループ', 'Users and approval groups')}</DialogTitle>
          {working && <Spinner size="extra-tiny" />}
          {/* 変更の履歴に残るのは、右上のログインしている人(U9。ここでは選ばせない) */}
          <span className={s.note}>{meName ? t(`${meName} として変更します`, `Editing as ${meName}`) : t('右上で、だれでログインするかを選んでください', 'Choose who is signed in at the top right')}</span>
          <Button appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={() => setOpen(false)} />
        </div>
        <span className={s.note}>
          {lock
            ? canEdit
              ? t('管理者として編集できます。変更は「変更の履歴」に残ります。やめた人は、消さずに「無効」にします(履歴に名前が残るように)。', 'You can edit as an admin. Every change is kept in the change history. Set people who left to Inactive instead of deleting them, so their names stay in the history.')
              : t('ログインしているので、編集できるのは管理者だけです(見るだけ)。', 'You are signed in, so only admins can edit (view only).')
            : t(
                'ログインが入るまでは、だれでも編集できます。変更は「変更の履歴」に残ります。やめた人は、消さずに「無効」にします(履歴に名前が残るように)。',
                'Until sign-in is added, anyone can edit here. Every change is kept in the change history. Set people who left to Inactive instead of deleting them, so their names stay in the history.',
              )}
        </span>
        {error && (
          <MessageBar intent="error" layout="multiline">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}
        <TabList size="small" selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as TabKey)}>
          <Tab value="users">
            {t('ユーザー', 'Users')} <Badge size="small" appearance="tint" color="informative">{people.users.length}</Badge>
          </Tab>
          <Tab value="groups">
            {t('承認グループ', 'Approval groups')} <Badge size="small" appearance="tint" color="informative">{people.groups.length}</Badge>
          </Tab>
          <Tab value="rules">{t('承認の決まり', 'Approval rules')}</Tab>
          <Tab value="history">{t('変更の履歴', 'Change history')}</Tab>
        </TabList>
        <div className={s.scroll}>{!people.loaded ? <Spinner size="tiny" /> : tab === 'users' ? usersTab : tab === 'groups' ? groupsTab : tab === 'rules' ? rulesTab : historyTab}</div>
      </ResizableSurface>
    </Dialog>
  )
}

/** ユーザー 1 人の行。名前・メールアドレスは、入力欄を離れたときに保存する(1 文字ごとに保存・履歴が増えないように) */
function UserRow({ user, disabled, onChange }: { user: User; disabled: boolean; onChange: (field: keyof UserFields, value: string) => void }) {
  const s = useStyles()
  const t = useT()
  const inactive = (user.status ?? 'active') === 'inactive'
  return (
    <>
      <Input size="small" className={inactive ? s.inactive : undefined} defaultValue={user.name} aria-label={t('名前', 'Name')} disabled={disabled} onBlur={(e) => onChange('name', e.target.value)} />
      <Input size="small" type="email" defaultValue={user.email ?? ''} aria-label={t('メールアドレス', 'Email')} disabled={disabled} onBlur={(e) => onChange('email', e.target.value)} />
      <Select size="small" value={user.role ?? 'member'} aria-label={t('役割', 'Role')} disabled={disabled} onChange={(_, d) => onChange('role', d.value)}>
        {roleOptions.map(([v, l]) => (
          <option key={v} value={v}>{optionLabel(l)}</option>
        ))}
      </Select>
      <Select size="small" value={user.status ?? 'active'} aria-label={t('状態', 'Status')} disabled={disabled} onChange={(_, d) => onChange('status', d.value)}>
        {statusOptions.map(([v, l]) => (
          <option key={v} value={v}>{optionLabel(l)}</option>
        ))}
      </Select>
    </>
  )
}
