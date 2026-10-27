// 配信カードの変更の履歴(X1)。中身の項目の変更(サーバーが change_logs に種類 edit・date で残す。server/ccp/data_api.py の WATCHED)、
// ステータスの変化(events)、差し替えの理由(メモの種類 change)を、新しい順に 1 本に並べる。
// 「⋯」の「変更の履歴…」のフロートと、シンプルな配信カードの左の「変更」で、同じものを出す
import { useEffect, useState } from 'react'
import { Button, Dialog, DialogBody, DialogContent, DialogTitle, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { DismissRegular, HistoryRegular } from '@fluentui/react-icons'
import { ResizableSurface } from './ResizableSurface'
import { ChangeLogsService, type ChangeLog } from './data/changeLogs'
import { CardNotesService, type CardNote } from './data/cardNotes'
import { EventsService, type CardEvent } from './data/events'
import { useT, when } from './i18n'
import { statusLabel } from './status'
import { typo } from './typo'
import { PaneSpinner } from './PaneSpinner'

const useStyles = makeStyles({
  surface: { width: 'min(560px, (94vw / var(--ui-zoom, 1)))' },
  list: { display: 'grid', alignContent: 'start', rowGap: '10px', fontSize: tokens.fontSizeBase200 },
  scroll: { maxHeight: 'calc(70vh / var(--ui-zoom, 1))', overflowY: 'auto' },
  group: { display: 'grid', rowGap: '4px', paddingBottom: '8px', borderBottom: `1px solid ${tokens.colorNeutralStroke3}` },
  meta: { display: 'flex', alignItems: 'center', columnGap: '6px', ...typo.caption },
  line: { display: 'grid', rowGap: '1px', minWidth: 0 },
  // 値に付くラベル(直した欄の名前)。値(前 → 後)は長くなるので、大きさ・太さは変えない
  field: typo.pairLabel,
  values: { color: tokens.colorNeutralForeground1, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' },
  before: { color: tokens.colorNeutralForeground3, textDecorationLine: 'line-through' },
  more: { justifySelf: 'start', minWidth: 0, padding: 0, height: 'auto' },
  empty: { color: tokens.colorNeutralForeground3, padding: '8px 2px' },
})

// 長い文(コピー・制作指示など)は、縮めて出し、押すと全文
const SHORT = 80

type Entry =
  | { at: string; actor: string; kind: 'edit'; logs: ChangeLog[] }
  | { at: string; actor: string; kind: 'event'; event: CardEvent }
  | { at: string; actor: string; kind: 'note'; note: CardNote }

/** 1 回の保存で変わった項目は、同じ時刻(サーバーのトランザクションの時刻)と人なので、まとめて 1 かたまりにする */
function entriesOf(logs: ChangeLog[], events: CardEvent[], notes: CardNote[]): Entry[] {
  const groups = new Map<string, ChangeLog[]>()
  for (const l of logs) {
    const k = `${l.created_on ?? ''}|${l.actor ?? ''}`
    groups.set(k, [...(groups.get(k) ?? []), l])
  }
  const out: Entry[] = [
    ...[...groups.values()].map((ls) => ({ at: ls[0].created_on ?? '', actor: ls[0].actor ?? '', kind: 'edit' as const, logs: ls })),
    ...events.filter((e) => e.action === 'status' || e.action === 'revoke' || e.action === 'reopen').map((e) => ({ at: e.created_on ?? '', actor: e.actor ?? '', kind: 'event' as const, event: e })),
    ...notes.filter((n) => n.kind === 'change').map((n) => ({ at: n.created_on ?? '', actor: n.author ?? '', kind: 'note' as const, note: n })),
  ]
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

/** 変更の履歴の一覧。version が変わったら読み直す(保存のあと・ステータスが変わったあと) */
export function CardHistoryList({ cardId, version, scroll }: { cardId: string; version?: unknown; scroll?: boolean }) {
  const s = useStyles()
  const t = useT()
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [opened, setOpened] = useState<Set<string>>(new Set())

  useEffect(() => {
    let alive = true
    void Promise.all([
      ChangeLogsService.getAll({ filter: `delivery_card_id eq ${cardId}`, orderBy: ['created_on desc'] }),
      EventsService.getAll({ filter: `delivery_card_id eq ${cardId}`, orderBy: ['created_on desc'] }),
      // やり取りは、ほかの部品と同じ並び(古い順)で読む(同じ読み込みに相乗りできるように。readShare)。並びは entriesOf で新しい順にする
      CardNotesService.getAll({ filter: `delivery_card_id eq ${cardId}`, orderBy: ['created_on asc'] }),
    ]).then(([c, e, n]) => {
      // 日程(date)と中身(edit)だけ。方針(policy)は商品の記録なので、配信の履歴には入れない
      const logs = c.success ? (c.data ?? []).filter((l) => l.kind === 'edit' || l.kind === 'date') : []
      if (alive) setEntries(entriesOf(logs, e.success ? (e.data ?? []) : [], n.success ? (n.data ?? []) : []))
    })
    return () => {
      alive = false
    }
  }, [cardId, version])

  const fieldName = (f?: string): string =>
    (
      ({
        name: t('配信名', 'Name'),
        scheduled_at: t('配信日時', 'Send date'),
        country: t('国', 'Country'),
        channel: t('チャネル', 'Channel'),
        layout_key: t('テンプレート', 'Template'),
        subject: t('件名', 'Subject'),
        preheader: t('プリヘッダー', 'Preheader'),
        theme: t('テーマ', 'Theme'),
        headline: t('見出し', 'Headline'),
        copy: t('コピー', 'Copy'),
        section_titles: t('セクションの見出し', 'Section titles'),
        section_copies: t('セクションのコピー', 'Section copy'),
        instructions: t('制作指示', 'Production notes'),
        hero_image_id: t('メイン画像', 'Main image'),
        links: t('リンク', 'Links'),
        push_title: t('通知のタイトル', 'Push title'),
        push_body: t('通知の本文', 'Push body'),
        push_link: t('通知のリンク', 'Push link'),
        audience: t('送る相手', 'Send to'),
        target_gender: t('性別', 'Gender'),
        target_ages: t('年代', 'Ages'),
        production_owner: t('制作の担当', 'Production assignee'),
        production_due: t('制作の締め切り', 'Production due'),
        theme_type: t('種類', 'Type'),
      }) as Record<string, string>
    )[f ?? ''] ?? (f || '')
  // 値の見せ方。ID・JSON のリンクは中身を読んでも分からないので、「替えた」だけ出す
  const valueOf = (l: ChangeLog, v?: string): string | null => {
    if (l.field === 'hero_image_id' || l.field === 'links') return null
    if (!v) return t('(空)', '(empty)')
    if (l.field === 'scheduled_at') return when(v)
    if (l.field === 'section_titles' || l.field === 'section_copies' || l.field === 'target_ages') {
      try {
        const a = JSON.parse(v) as unknown
        if (Array.isArray(a)) return a.filter(Boolean).join(' / ') || t('(空)', '(empty)')
      } catch {
        /* JSON でなければ、そのまま */
      }
    }
    return v
  }

  const line = (l: ChangeLog) => {
    const before = valueOf(l, l.before_value)
    const after = valueOf(l, l.after_value)
    const long = (before?.length ?? 0) + (after?.length ?? 0) > SHORT * 2
    const open = opened.has(l.id)
    const cut = (v: string) => (long && !open && v.length > SHORT ? `${v.slice(0, SHORT)}…` : v)
    return (
      <div key={l.id} className={s.line}>
        <span className={s.field}>{fieldName(l.field)}</span>
        {before === null || after === null ? (
          <span className={s.values}>{t('替えました', 'Changed')}</span>
        ) : (
          <span className={s.values}>
            <span className={s.before}>{cut(before)}</span>
            {' → '}
            {cut(after)}
          </span>
        )}
        {long && (
          <Button className={s.more} size="small" appearance="transparent" onClick={() => setOpened(new Set(open ? [...opened].filter((x) => x !== l.id) : [...opened, l.id]))}>
            {open ? t('縮める', 'Show less') : t('全文を見る', 'Show all')}
          </Button>
        )}
      </div>
    )
  }

  if (entries === null) return <PaneSpinner />
  return (
    <div className={mergeClasses(s.list, scroll && s.scroll)}>
      {entries.length === 0 && <span className={s.empty}>{t('まだ変更の履歴はありません', 'No changes yet')}</span>}
      {entries.map((e, i) => (
        <div key={`${e.kind}:${e.at}:${i}`} className={s.group}>
          <span className={s.meta}>
            <HistoryRegular />
            {`${when(e.at)} · ${e.actor || t('(名前なし)', '(no name)')}`}
          </span>
          {e.kind === 'edit' && e.logs.map(line)}
          {e.kind === 'event' && (
            <span className={s.values}>
              <span className={s.field}>{t('ステータス', 'Status')}</span> {statusLabel(e.event.from_status, true)} → {statusLabel(e.event.to_status, true)}
              {e.event.note ? `(${e.event.note})` : ''}
            </span>
          )}
          {e.kind === 'note' && <span className={s.values}>{e.note.body}</span>}
        </div>
      ))}
    </div>
  )
}

/** 「⋯」の「変更の履歴…」で開くフロート */
export function CardHistoryDialog({ cardId, cardName, onClose }: { cardId: string; cardName?: string; onClose: () => void }) {
  const s = useStyles()
  const t = useT()
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <ResizableSurface sizeKey="cardHistory" className={s.surface}>
        <DialogBody>
          <DialogTitle action={<Button appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={onClose} />}>
            {cardName ? t(`「${cardName}」の変更の履歴`, `Change history of "${cardName}"`) : t('変更の履歴', 'Change history')}
          </DialogTitle>
          <DialogContent>
            <CardHistoryList cardId={cardId} scroll />
          </DialogContent>
        </DialogBody>
      </ResizableSurface>
    </Dialog>
  )
}
