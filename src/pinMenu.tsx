import { ArrowRepeatAllRegular, CheckmarkRegular, LinkRegular } from '@fluentui/react-icons'
import type { CardNote } from './data/cardNotes'
import type { ContextItem } from './ContextMenu'
import { copyText } from './clipboard'
import { tr } from './i18n'
import { pinLink, setNoteResolved } from './pinActions'

/** ピンの上の右クリックの項目: 解決にする(未解決に戻す)・リンクをコピー。フロートの「解決にする」と同じ処理を呼ぶ */
export function pinMenuItems(n: CardNote, me: string): ContextItem[] {
  return [
    n.resolved
      ? { key: 'reopen', label: tr('未解決に戻す', 'Reopen'), icon: <ArrowRepeatAllRegular />, onSelect: () => void setNoteResolved(n, false, me) }
      : { key: 'resolve', label: tr('解決にする', 'Resolve'), icon: <CheckmarkRegular />, onSelect: () => void setNoteResolved(n, true, me) },
    { key: 'link', label: tr('リンクをコピー', 'Copy link'), icon: <LinkRegular />, onSelect: () => void copyText(pinLink(n.id)) },
  ]
}
