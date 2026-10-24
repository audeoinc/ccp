import { useEffect, useState, useSyncExternalStore } from 'react'
import { Badge, Button, Dialog, DialogBody, DialogContent, DialogTitle, Input, Select, Spinner, Tab, TabList, makeStyles, tokens } from '@fluentui/react-components'
import { ResizableSurface } from './ResizableSurface'
import { CheckmarkRegular, CopyRegular, DismissRegular, OpenRegular, ThumbLikeFilled, ThumbLikeRegular } from '@fluentui/react-icons'
import { DevRequestsService } from './data/devRequests'
import { DevRequestVotesService } from './data/devRequestVotes'
import type { DevRequestVote } from './models/devRequestVotes'
import type { DevRequest, DevRequestStatus } from './models/devRequests'
import { buildId, bumpDevRequests, devRequestName, devRequestsVersion, onDevRequestName, setDevRequestName, subscribeDevRequests, toggleVote, votesOf } from './devRequestPlace'
import { copyText } from './clipboard'
import { Linkify } from './LinkText'
import { locale, tr, useT } from './i18n'

const useStyles = makeStyles({
  surface: { width: 'min(1100px, (94vw / var(--ui-zoom, 1)))', maxWidth: 'none', height: 'calc(86vh / var(--ui-zoom, 1))' },
  body: { height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 },
  inline: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  titleRow: { display: 'flex', alignItems: 'center', columnGap: '8px' },
  grow: { flexGrow: 1, minWidth: 0 },
  bar: { display: 'flex', alignItems: 'center', columnGap: '8px', flexWrap: 'wrap', margin: '4px 0 8px' },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  list: { display: 'grid', rowGap: '8px', overflowY: 'auto', minHeight: 0, alignContent: 'start' },
  row: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 160px', columnGap: '12px', padding: '10px 12px', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium },
  place: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, overflowWrap: 'anywhere' },
  text: { fontSize: tokens.fontSizeBase300, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  meta: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  reply: { fontSize: tokens.fontSizeBase200, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', paddingLeft: '12px', borderLeft: `2px solid ${tokens.colorNeutralStroke2}` },
  side: { display: 'grid', rowGap: '6px', alignContent: 'start' },
  error: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1 },
})

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const statusName = (v?: string) => (v === 'done' ? tr('対応済み', 'Done') : v === 'declined' ? tr('見送り', 'Declined') : tr('未対応', 'Open'))

/** まとめてコピーの文(連絡係に貼って、要件として整理できる形。画面の場所・配信カードの ID・書いた人・時刻・本文・返信・状態) */
function copyTextOf(list: DevRequest[], repliesOf: (id: string) => DevRequest[], votersOf: (id: string) => string[]): string {
  const head = tr(`## 開発へのリクエスト(${list.length} 件。${new Date().toLocaleString(locale())} 時点)`, `## Requests to developers (${list.length}, as of ${new Date().toLocaleString(locale())})`)
  const items = list.map((q, i) => {
    const lines = [
      `${i + 1}. [${statusName(q.status)}${q.status === 'done' && q.done_version ? ` ${q.done_version}` : ''}] ${q.place_text || tr('(場所の文なし)', '(no place text)')}`,
      `   ${tr('書いた人', 'By')}: ${q.author_name || tr('(名前なし)', '(no name)')} / ${when(q.created_on)}`,
      `   ${tr('賛同', 'Agreed')}: ${votersOf(q.id).length}${votersOf(q.id).length ? `(${votersOf(q.id).join('、')})` : ''}`,
      ...(q.delivery_card_id ? [`   ${tr('配信カードの ID', 'Delivery card ID')}: ${q.delivery_card_id}`] : []),
      `   ${tr('画面', 'Screen')}: ${q.screen ?? ''}${q.url ? ` (${q.url})` : ''}`,
      `   ${tr('本文', 'Text')}: ${(q.body ?? '').replace(/\n/g, '\n     ')}`,
      ...repliesOf(q.id).map((r) => `   - ${r.author_name || tr('(名前なし)', '(no name)')}(${when(r.created_on)}): ${(r.body ?? '').replace(/\n/g, ' ')}`),
    ]
    return lines.join('\n')
  })
  return [head, '', ...items].join('\n')
}

/**
 * 開発へのリクエストの一覧(ヘッダーのリンクからは窓で、設定の画面の「開発・管理」では中に描く)。状態(未対応 / 対応済み / 見送り)を変え、「まとめてコピー」で要件の材料にする。
 * 対応済みにすると、その日時と画面の版を残す(ピン・フロートで「対応済み(日付・版)」と、書いた人に分かる)
 */
export function DevRequestsDialog({ onClose, inline }: { onClose?: () => void; inline?: boolean }) {
  const s = useStyles()
  const t = useT()
  const version = useSyncExternalStore(subscribeDevRequests, devRequestsVersion)
  const [rows, setRows] = useState<DevRequest[] | null>(null)
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [votes, setVotes] = useState<DevRequestVote[]>([])
  // 並べ方: 新しい順 / 賛同の多い順
  const [order, setOrder] = useState<'new' | 'votes'>('new')
  const name = useSyncExternalStore(onDevRequestName, devRequestName)
  const [nameDraft, setNameDraft] = useState('')

  useEffect(() => {
    let alive = true
    void DevRequestsService.getAll({ orderBy: ['created_on desc'] }).then((r) => {
      if (!alive) return
      if (r.success) setRows(r.data ?? [])
      else setError(r.error?.message ?? tr('読み込めませんでした', 'Could not load'))
    })
    void DevRequestVotesService.getAll().then((r) => {
      if (alive && r.success) setVotes(r.data ?? [])
    })
    return () => {
      alive = false
    }
  }, [version])

  const all = rows ?? []
  const roots = all.filter((q) => !q.source_request)
  const votersOf = (id: string) => votesOf(votes, id).map((v) => v.voter_name ?? '')
  const filtered = filter === 'open' ? roots.filter((q) => (q.status ?? 'open') === 'open') : roots
  // 賛同の多い順(同じ数なら新しい順)。新しい順は、読んだ順(created_on の新しい順)のまま
  const shown = order === 'votes' ? [...filtered].sort((a, b) => votersOf(b.id).length - votersOf(a.id).length || (b.created_on ?? '').localeCompare(a.created_on ?? '')) : filtered
  const vote = async (q: DevRequest) => {
    setError(null)
    try {
      await toggleVote(q.id, name, votes)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const repliesOf = (id: string) => all.filter((q) => q.source_request === id).sort((a, b) => (a.created_on ?? '').localeCompare(b.created_on ?? ''))
  const openCount = roots.filter((q) => (q.status ?? 'open') === 'open').length

  const setStatus = async (q: DevRequest, status: DevRequestStatus) => {
    setError(null)
    const r = await DevRequestsService.update(q.id, status === 'done' ? { status, done_at: new Date().toISOString(), done_version: buildId() } : { status, done_at: null as never, done_version: '' })
    if (!r.success) setError(r.error?.message ?? tr('保存できませんでした', 'Could not save'))
    bumpDevRequests()
  }
  // その画面を開く(書いたときの URL に、開くリクエストを足して読み込み直す。DevRequestLayer がフロートを開く)
  const openScreen = (q: DevRequest) => {
    const p = new URLSearchParams(q.url ?? '')
    p.set('devreq', q.id)
    window.location.assign(`${window.location.pathname}?${p.toString()}`)
  }

  const content = (
    <>
            <span className={s.caption}>
              {t(
                '画面のどこでも、右クリック →「開発に伝える」で書いたものです。状態を変えると、その場で保存します。「まとめてコピー」の文を貼ると、要件として整理できます。',
                'Written with right-click → "Tell the developers" anywhere. Status changes are saved right away. Paste the "Copy all" text to turn them into requirements.',
              )}
            </span>
            <div className={s.bar}>
              <TabList size="small" selectedValue={filter} onTabSelect={(_, d) => setFilter(d.value as 'open' | 'all')}>
                <Tab value="open">{t(`未対応 ${openCount}`, `Open ${openCount}`)}</Tab>
                <Tab value="all">{t(`すべて ${roots.length}`, `All ${roots.length}`)}</Tab>
              </TabList>
              <Select size="small" value={order} onChange={(_, d) => setOrder(d.value as 'new' | 'votes')} aria-label={t('並べ方', 'Order')}>
                <option value="new">{t('新しい順', 'Newest first')}</option>
                <option value="votes">{t('賛同の多い順', 'Most agreed first')}</option>
              </Select>
              <span className={s.grow} />
              {/* 賛同する人の名前(リクエスト用。フロートと同じ。ブラウザが覚える) */}
              {name ? (
                <span className={s.meta}>
                  {t(`${name} として賛同する`, `Agreeing as ${name}`)}
                  <Button size="small" appearance="transparent" onClick={() => setDevRequestName('')}>
                    {t('(変える)', '(change)')}
                  </Button>
                </span>
              ) : (
                <span className={s.meta} style={{ display: 'flex', alignItems: 'center', columnGap: 4 }}>
                  <Input size="small" value={nameDraft} onChange={(_, d) => setNameDraft(d.value)} placeholder={t('賛同する人の名前', 'Your name to agree')} />
                  <Button size="small" disabled={!nameDraft.trim()} onClick={() => setDevRequestName(nameDraft)}>
                    {t('決める', 'Set')}
                  </Button>
                </span>
              )}
              <Button
                size="small"
                icon={copied ? <CheckmarkRegular /> : <CopyRegular />}
                disabled={shown.length === 0}
                onClick={async () => {
                  if (await copyText(copyTextOf(shown, repliesOf, votersOf))) {
                    setCopied(true)
                    window.setTimeout(() => setCopied(false), 2000)
                  }
                }}
              >
                {copied ? t('コピーしました', 'Copied') : t(`まとめてコピー(${shown.length} 件)`, `Copy all (${shown.length})`)}
              </Button>
            </div>
            {error && <span className={s.error}>{error}</span>}
            {rows === null ? (
              <Spinner size="tiny" />
            ) : shown.length === 0 ? (
              <span className={s.caption}>{filter === 'open' ? t('未対応のリクエストはありません。', 'No open requests.') : t('まだリクエストはありません。', 'No requests yet.')}</span>
            ) : (
              <div className={s.list}>
                {shown.map((q) => (
                  <div key={q.id} className={s.row}>
                    <div style={{ display: 'grid', rowGap: 4, minWidth: 0 }}>
                      <span className={s.place}>{q.place_text}</span>
                      <span className={s.text}><Linkify text={q.body} /></span>
                      <span className={s.meta}>{[q.author_name || t('(名前なし)', '(no name)'), when(q.created_on), q.delivery_card_id ? t(`配信カード ${q.delivery_card_id}`, `Card ${q.delivery_card_id}`) : ''].filter(Boolean).join(' ・ ')}</span>
                      {repliesOf(q.id).map((r) => (
                        <span key={r.id} className={s.reply}>{`${r.author_name || t('(名前なし)', '(no name)')}(${when(r.created_on)}): ${r.body ?? ''}`}</span>
                      ))}
                    </div>
                    <div className={s.side}>
                      {/* 賛同(いいね)。1 人 1 回、もう一度押すと取り消す。名前は上の欄で決める */}
                      <Button
                        size="small"
                        appearance={votersOf(q.id).includes(name) && !!name ? 'primary' : 'outline'}
                        icon={votersOf(q.id).includes(name) && !!name ? <ThumbLikeFilled /> : <ThumbLikeRegular />}
                        disabled={!name}
                        title={votersOf(q.id).join('、') || undefined}
                        onClick={() => void vote(q)}
                      >
                        {t(`賛同 ${votersOf(q.id).length}`, `Agree ${votersOf(q.id).length}`)}
                      </Button>
                      <Select size="small" value={q.status ?? 'open'} onChange={(_, d) => void setStatus(q, d.value as DevRequestStatus)} aria-label={t('状態', 'Status')}>
                        <option value="open">{t('未対応', 'Open')}</option>
                        <option value="done">{t('対応済み', 'Done')}</option>
                        <option value="declined">{t('見送り', 'Declined')}</option>
                      </Select>
                      {q.status === 'done' && (
                        <Badge appearance="tint" color="success" size="small">
                          {t(`${when(q.done_at)}${q.done_version ? `・版 ${q.done_version}` : ''}`, `${when(q.done_at)}${q.done_version ? `, build ${q.done_version}` : ''}`)}
                        </Badge>
                      )}
                      {q.url !== undefined && (
                        <Button size="small" appearance="subtle" icon={<OpenRegular />} onClick={() => openScreen(q)}>
                          {t('この画面を開く', 'Open this screen')}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
    </>
  )
  if (inline) return <div className={s.inline}>{content}</div>
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose?.()}>
      <ResizableSurface sizeKey="devRequests" className={s.surface}>
        <DialogBody className={s.body}>
          <div className={s.titleRow}>
            <DialogTitle className={s.grow}>{t('開発へのリクエスト', 'Requests to developers')}</DialogTitle>
            <Button appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label={t('閉じる', 'Close')} />
          </div>
          <DialogContent style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flexGrow: 1 }}>{content}</DialogContent>
        </DialogBody>
      </ResizableSurface>
    </Dialog>
  )
}
