// ユーザーと承認グループ(バックログ U1。docs/APPROVAL.md)を、画面のどこからでも同じ内容で使うための置き場。
// 最初に使われたときに読み込み、編集したら reloadPeople で読み直す(読み込みは画面全体で 1 回で済ませる)
import { useSyncExternalStore } from 'react'
import { UsersService } from './data/users'
import { ApprovalGroupsService } from './data/approvalGroups'
import { ApprovalGroupMembersService } from './data/approvalGroupMembers'
import type { User } from './models/users'
import type { ApprovalGroup } from './models/approvalGroups'
import type { ApprovalGroupMember } from './models/approvalGroupMembers'

export interface People {
  /** 読み込めたか(読み込む前・失敗したときは false。そのあいだは、名前の入力に戻す) */
  loaded: boolean
  users: User[]
  groups: ApprovalGroup[]
  members: ApprovalGroupMember[]
}

let state: People = { loaded: false, users: [], groups: [], members: [] }
let started = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((f) => f())

const byName = <T extends { name?: string }>(a: T, b: T) => (a.name ?? '').localeCompare(b.name ?? '')

export async function reloadPeople(): Promise<void> {
  started = true
  const [u, g, m] = await Promise.all([UsersService.getAll(), ApprovalGroupsService.getAll(), ApprovalGroupMembersService.getAll()])
  // ユーザーが読めなければ、読めていない扱いにする(「あなた」は名前の入力に戻る。いまの運用を止めないため)
  if (!u.success) return
  state = { loaded: true, users: [...(u.data ?? [])].sort(byName), groups: g.success ? [...(g.data ?? [])].sort(byName) : [], members: m.success ? (m.data ?? []) : [] }
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
