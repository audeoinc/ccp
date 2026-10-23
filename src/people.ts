// ユーザーと承認グループ(バックログ U1。docs/APPROVAL.md)を、画面のどこからでも同じ内容で使うための置き場。
// 最初に使われたときに読み込み、編集したら reloadPeople で読み直す(読み込みは画面全体で 1 回で済ませる)
import { useSyncExternalStore } from 'react'
import { UsersService } from './data/users'
import { ApprovalGroupsService } from './data/approvalGroups'
import { ApprovalGroupMembersService } from './data/approvalGroupMembers'
import { ApprovalRulesService } from './data/approvalRules'
import { MeService } from './data/me'
import { setMe, setMeLock } from './history'
import type { User } from './models/users'
import type { ApprovalGroup } from './models/approvalGroups'
import type { ApprovalGroupMember } from './models/approvalGroupMembers'
import type { ApprovalRule } from './models/approvalRules'
import { parseIds } from './approvals'

export interface People {
  /** 読み込めたか(読み込む前・失敗したときは false。そのあいだは、名前の入力に戻す) */
  loaded: boolean
  users: User[]
  groups: ApprovalGroup[]
  members: ApprovalGroupMember[]
  /** 種別ごとの既定の承認者と決まり(U3) */
  rules: ApprovalRule[]
}

let state: People = { loaded: false, users: [], groups: [], members: [], rules: [] }
let started = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((f) => f())

const byName = <T extends { name?: string }>(a: T, b: T) => (a.name ?? '').localeCompare(b.name ?? '')

export async function reloadPeople(): Promise<void> {
  started = true
  const [u, g, m, r, me] = await Promise.all([UsersService.getAll(), ApprovalGroupsService.getAll(), ApprovalGroupMembersService.getAll(), ApprovalRulesService.getAll(), MeService.get()])
  // ログインしている人(U7)がいれば、「あなた」をその人に固定する(登録がなければ、メールアドレスだけ見せる)
  if (me?.email) {
    if (me.user) setMe({ id: me.user.id, name: me.user.name })
    else setMe(undefined)
    setMeLock({ email: me.email, registered: !!me.user })
  } else setMeLock(null)
  // ユーザーが読めなければ、読めていない扱いにする(「あなた」は名前の入力に戻る。いまの運用を止めないため)
  if (!u.success) return
  state = { loaded: true, users: [...(u.data ?? [])].sort(byName), groups: g.success ? [...(g.data ?? [])].sort(byName) : [], members: m.success ? (m.data ?? []) : [], rules: r.success ? (r.data ?? []) : [] }
  emit()
}

const subscribe = (f: () => void) => {
  listeners.add(f)
  if (!started) void reloadPeople()
  return () => listeners.delete(f)
}

export const usePeople = (): People => useSyncExternalStore(subscribe, () => state)

/** 選べるユーザー(有効な人だけ) */
export const activeUsers = (p: People) => p.users.filter((u) => (u.status ?? 'active') === 'active')

/** そのグループのメンバー(有効な人だけ) */
export const groupUsers = (p: People, groupId: string) => {
  const ids = new Set(p.members.filter((m) => m.approval_group_id === groupId).map((m) => m.user_id))
  return activeUsers(p).filter((u) => ids.has(u.id))
}

// 「ユーザーと承認グループ」の画面(PeopleManager)を開く・閉じる(⚙ のメニューから開く。テンプレートの管理と同じ形)
let managerOpen = false
const managerListeners = new Set<() => void>()
export const setPeopleManagerOpen = (v: boolean) => {
  managerOpen = v
  managerListeners.forEach((f) => f())
}
export const openPeopleManager = () => setPeopleManagerOpen(true)
const subscribeManager = (f: () => void) => {
  managerListeners.add(f)
  return () => {
    managerListeners.delete(f)
  }
}
export const usePeopleManagerOpen = (): boolean => useSyncExternalStore(subscribeManager, () => managerOpen)

/** その人が入っている承認グループの id */
export const groupsOf = (p: People, userId: string) => p.members.filter((m) => m.user_id === userId).map((m) => m.approval_group_id)

/**
 * 承認の既定の相手と決まり(なければ undefined)。すべての配信に同じルール(2026-10-19、利用者の判断: 配信カードの「種別」をやめたため)。
 * 国ごとに決められる(ST4。country の列。国の行がなければ共通)。
 * 共通のルールは department と country が空の行。まだなければ、以前の種別ごとの行のうち、相手が入っているいちばん古い行を使う(作り直さなくても、これまでの設定で依頼できるように)
 */
export const ruleFor = (p: People, country?: string | null): ApprovalRule | undefined => {
  // 国の決まり(ST4)があれば、その国の配信はそちらを使う。なければ共通
  const own = country ? p.rules.find((r) => !r.department && r.country === country) : undefined
  if (own) return own
  const common = p.rules.find((r) => !r.department && !r.country)
  if (common) return common
  const filled = p.rules.filter((r) => !r.country && (parseIds(r.group_ids).length || parseIds(r.user_ids).length))
  return [...filled].sort((a, b) => (a.created_on ?? '').localeCompare(b.created_on ?? ''))[0]
}

/** 承認グループが承認する国(ST4。空はすべての国) */
export const groupCountries = (g: ApprovalGroup): string[] => parseIds(g.countries)

/** その国の配信を承認するグループか(国を渡さないときは、すべて) */
export const groupInCountry = (g: ApprovalGroup, country?: string | null): boolean => {
  const list = groupCountries(g)
  return !country || list.length === 0 || list.includes(country)
}
