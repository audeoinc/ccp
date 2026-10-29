import { useCallback, useState, type ReactElement, type ReactNode } from 'react'
import { Menu, MenuDivider, MenuItem, MenuList, MenuPopover } from '@fluentui/react-components'

/**
 * 右クリックのメニュー(2026-10-23 利用者: まずプレビューの「ここにピンを打ってコメントする」。ほかの面・部品・一覧にも広げていく)。
 * 使う側は、項目の一覧を作って openAt に渡すだけ(項目は場所ごとに違うので、部品は中身を知らない)。文言は使う側で t(...) にする。
 * ブラウザのメニュー(文字のコピーなど)を残す逃げ道: Shift を押しながらの右クリック、入力欄・編集できる所の上、文字を選んでいるとき
 */
export interface ContextItem {
  key: string
  label: string
  icon?: ReactElement
  onSelect: () => void
  disabled?: boolean
  /** この項目の前に区切り線 */
  divider?: boolean
}

/** ブラウザのメニューのままにする右クリックか */
export function keepBrowserMenu(e: { shiftKey: boolean; target: EventTarget | null }, doc: Document = document): boolean {
  if (e.shiftKey) return true
  // iframe の中の要素は、別の文書の Element なので instanceof では見分けない
  const el = e.target && typeof (e.target as Element).closest === 'function' ? (e.target as Element) : null
  if (el?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return true
  const sel = doc.getSelection()
  return !!sel && !sel.isCollapsed && sel.toString().trim() !== ''
}

/**
 * どの右クリックのメニューにも、最後に足す項目(「ここについて聞く」・開発へのリクエスト「開発に伝える」など)。押した画面の点を受け取り、項目を返す。
 * 足す側(上の帯・DevRequestLayer)が、画面を開いている間だけ置く。並びは order の小さい順(聞く → 開発に伝える)
 */
type GlobalItems = (x: number, y: number) => ContextItem[]
const globalItems = new Map<string, { order: number; f: GlobalItems }>()
/** 足す項目を置く(f = null で外す)。key ごとに 1 つ */
export function setGlobalMenuItems(f: GlobalItems | null, key = 'dev-request', order = 100) {
  if (f) globalItems.set(key, { order, f })
  else globalItems.delete(key)
}
/** どの右クリックにも足す項目が 1 つでも置かれているか(どれも非公開なら、メニューのない所ではブラウザのメニューのままにする。X87) */
export const hasGlobalMenuItems = () => globalItems.size > 0
const allGlobalItems = (x: number, y: number) =>
  [...globalItems.values()].sort((a, b) => a.order - b.order).flatMap((g) => g.f(x, y))

interface At {
  x: number
  y: number
  items: ContextItem[]
}

/**
 * 右クリックのメニューの状態と、描く部品。
 * openAt(画面の座標, 項目) で開く(枠 iframe の中の右クリックは、使う側で枠の位置を足した座標を渡す)。menu を、使う側のどこかに置く
 */
export function useContextMenu(): { openAt: (x: number, y: number, items: ContextItem[]) => void; close: () => void; menu: ReactNode } {
  const [at, setAt] = useState<At | null>(null)
  const openAt = useCallback((x: number, y: number, items: ContextItem[]) => {
    const extra = allGlobalItems(x, y)
    const all = [...items, ...extra.map((it, i) => (i === 0 && items.length ? { ...it, divider: true } : it))]
    setAt(all.length ? { x, y, items: all } : null)
  }, [])
  const close = useCallback(() => setAt(null), [])
  // 押した点を、大きさ 0 の要素としてメニューの位置の基準にする
  const target = at ? { getBoundingClientRect: () => DOMRect.fromRect({ x: at.x, y: at.y, width: 0, height: 0 }) } : undefined
  const menu = at ? (
    <Menu open positioning={{ target, position: 'below', align: 'start' }} onOpenChange={(_, d) => !d.open && close()}>
      <MenuPopover>
        <MenuList>
          {at.items.map((it) => (
            <span key={it.key} style={{ display: 'contents' }}>
              {it.divider && <MenuDivider />}
              <MenuItem
                icon={it.icon}
                disabled={it.disabled}
                onClick={() => {
                  close()
                  // 押した click が終わってから動かす(項目で開いたフロートが、同じ click を「外を押した」と受け取って閉じないように)
                  window.setTimeout(it.onSelect, 0)
                }}
              >
                {it.label}
              </MenuItem>
            </span>
          ))}
        </MenuList>
      </MenuPopover>
    </Menu>
  ) : null
  return { openAt, close, menu }
}

/**
 * 項目を選んだあとで、入力欄などに焦点を移す(「AI に頼む」で AI の入力欄へ)。
 * メニューが閉じるときに焦点を戻す・開いたタブが焦点を取るので、少しの間、移るまで繰り返す
 */
export function focusSoon(selector: string, tries = 8) {
  const el = document.querySelector<HTMLElement>(selector)
  if (el && document.activeElement === el) return
  el?.focus()
  if (tries > 0) window.setTimeout(() => focusSoon(selector, tries - 1), 100)
}
