import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Badge, Button, Field, Input, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Popover, Portal, PopoverSurface, PopoverTrigger, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { CheckmarkRegular, DeleteRegular, DismissRegular, MoreHorizontalRegular, LightbulbFilled, LightbulbRegular, LocationOffRegular, ThumbLikeFilled, ThumbLikeRegular } from '@fluentui/react-icons'
import type { LinkState } from './deepLink'
import { getUiScale } from './uiScale'
import { DevRequestsService } from './data/devRequests'
import { DevRequestVotesService } from './data/devRequestVotes'
import type { DevRequestVote } from './models/devRequestVotes'
import type { DevRequest } from './models/devRequests'
import { keepBrowserMenu, setGlobalMenuItems, useContextMenu } from './ContextMenu'
import {
  bumpDevRequests,
  capturePlace,
  deleteDevRequest,
  devRequestName,
  devRequestsVersion,
  forgetLinkedRequest,
  linkedRequest,
  locate,
  uncovered,
  onDevRequestName,
  screenKey,
  screenLabel,
  setDevRequestName,
  subscribeDevRequests,
  toggleVote,
  votesOf,
  type CapturedPlace,
} from './devRequestPlace'
import { usePinAnchor } from './pinAnchor'
import { PinThreadView } from './PinThreadView'
import { PinThenImage } from './PinThenImage'
import { attachCapture, startCaptureAt } from './pinSnapshot'
import { locale, tr, useT } from './i18n'
import { Z } from './layers'

const PIN = 22

const useStyles = makeStyles({
  then: { display: 'grid', rowGap: '4px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  // 画面の上に重ねる層。層は押せない(ピンだけ押せる)。配信カードなどのダイアログの上にも出すので、いちばん上に置き、
  // ほかのダイアログ・メニューに隠れた所のピンは出さない(devRequestPlace の uncovered)
  layer: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: Z.devRequests },
  // 層の置き場(Fluent の Portal が body の下に作る箱)。Fluent の置き場は、どれも z-index 1000000 で、あとから body に足したものが上になる。
  // この層の置き場はアプリを開いたときに作るので、そのままでは、あとから開く配信カードなどのダイアログの下に隠れ、ピンが見えず押せなかった
  // (2026-10-24)。置き場だけを一段上げ、どのダイアログよりも上にする(ダイアログに隠れた所のピンは、uncovered で出さない)
  host: { zIndex: Z.devRequests },
  // レビューのピン(丸い吹き出し・橙)・アプリの色(紫)・アラートの色と見分けるため、ひし形の墨色に黄色の電球にする(2026-10-23 利用者。
  // 画面のどこにも使っていない組み合わせで、業務の印ではなく開発への付箋と分かるように)。明暗のテーマで反転しない色を使う。
  // 電球は、ピンとフロートの札だけ塗りにして目に付くように(メニュー・ヘッダーは線のまま。2026-10-23 利用者)
  pin: {
    position: 'absolute',
    width: `${PIN}px`,
    height: `${PIN}px`,
    marginLeft: `-${PIN / 2}px`,
    marginTop: `-${PIN / 2}px`,
    display: 'grid',
    placeItems: 'center',
    padding: 0,
    transform: 'rotate(45deg)',
    borderRadius: '4px',
    border: `2px solid ${tokens.colorNeutralForegroundOnBrand}`,
    backgroundColor: tokens.colorNeutralBackgroundStatic,
    color: tokens.colorPaletteYellowBackground3,
    boxShadow: tokens.shadow8,
    cursor: 'pointer',
    pointerEvents: 'auto',
    fontFamily: 'inherit',
  },
  // 中の印は、ひし形の回転を戻して正しい向きに
  pinIcon: { transform: 'rotate(-45deg)', display: 'grid', placeItems: 'center', fontSize: '13px' },
  pinDone: { backgroundColor: tokens.colorPaletteGreenBackground3, color: tokens.colorNeutralForegroundOnBrand },
  pinDeclined: { backgroundColor: tokens.colorNeutralBackground5, color: tokens.colorNeutralForeground2 },
  pinNew: { backgroundColor: tokens.colorBrandBackground, cursor: 'default' },
  // 場所が見つからないリクエストの置き場(画面の左下)
  tray: { position: 'absolute', left: '12px', bottom: '12px', pointerEvents: 'auto' },
  trayList: { display: 'grid', rowGap: '4px', maxWidth: '360px', maxHeight: '50vh', overflowY: 'auto' },
  trayItem: {
    display: 'grid',
    rowGap: '2px',
    textAlign: 'left',
    padding: '6px 8px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    fontFamily: 'inherit',
    cursor: 'pointer',
    ':hover': { border: `1px solid ${tokens.colorBrandStroke1}` },
  },
  trayPlace: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  trayBody: { fontSize: tokens.fontSizeBase200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  badgeIcon: { width: '18px', height: '18px', display: 'grid', placeItems: 'center', flexShrink: 0, borderRadius: '3px', transform: 'rotate(45deg)', backgroundColor: tokens.colorNeutralBackgroundStatic, color: tokens.colorPaletteYellowBackground3 },
  nameRow: { display: 'flex', alignItems: 'center', columnGap: '4px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  status: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap' },
  // ピンの右上に、賛同の数(ひし形は回っているので、ピンの外に重ねる)
  votes: {
    position: 'absolute',
    marginLeft: `${PIN / 2 - 2}px`,
    marginTop: `-${PIN / 2 + 8}px`,
    minWidth: '16px',
    height: '16px',
    padding: '0 4px',
    boxSizing: 'border-box',
    borderRadius: '8px',
    display: 'grid',
    placeItems: 'center',
    fontSize: '10px',
    fontWeight: tokens.fontWeightBold,
    backgroundColor: tokens.colorPaletteYellowBackground3,
    color: tokens.colorNeutralForegroundStaticInverted,
    boxShadow: tokens.shadow4,
    pointerEvents: 'none',
  },
  voters: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
})

/** いま開いているフロート: 刺さっているリクエスト(ID)か、打ったばかり(場所だけ) */
type Target = { id: string } | { pending: CapturedPlace & { screen: string; url: string; place_text: string } }

interface Props {
  /** いまの画面(App の URL の状態) */
  link: Partial<LinkState>
  cardName: (id: string) => string
}

const statusText = (q: DevRequest) =>
  q.status === 'done'
    ? tr(`対応済み(${q.done_at ? new Date(q.done_at).toLocaleDateString(locale(), { month: 'numeric', day: 'numeric' }) : ''}${q.done_version ? `・版 ${q.done_version}` : ''})`, `Done (${q.done_at ? new Date(q.done_at).toLocaleDateString(locale()) : ''}${q.done_version ? `, build ${q.done_version}` : ''})`)
    : q.status === 'declined'
      ? tr('見送り', 'Declined')
      : tr('未対応', 'Open')

/**
 * 開発へのリクエスト(2026-10-23 利用者: 使っている人が、画面のどこでも、直したい所に右クリックでピンを打って要望を書き、要件が CCP の中に貯まるように)。
 * どの右クリックのメニューにも「開発に伝える」を足し(ContextMenu の setGlobalMenuItems)、メニューのない所の右クリックでは、これだけのメニューを出す。
 * いまの画面のリクエストをピン(墨色のひし形に黄色の電球)で出し、目印が見つからないものは、左下の置き場にまとめて、場所の文を見せる
 */
export function DevRequestLayer({ link, cardName }: Props) {
  const s = useStyles()
  const t = useT()
  const version = useSyncExternalStore(subscribeDevRequests, devRequestsVersion)
  const [rows, setRows] = useState<DevRequest[]>([])
  const [votes, setVotes] = useState<DevRequestVote[]>([])
  const [target, setTarget] = useState<Target | null>(() => {
    const id = linkedRequest()
    return id ? { id } : null
  })
  const [spots, setSpots] = useState<{ id: string; left: number; top: number }[]>([])
  const [missing, setMissing] = useState<string[]>([])
  const [trayOpen, setTrayOpen] = useState(false)
  const screen = screenKey(link)

  useEffect(() => {
    let alive = true
    void DevRequestsService.getAll({ orderBy: ['created_on asc'] }).then((r) => {
      if (alive && r.success) setRows(r.data ?? [])
    })
    void DevRequestVotesService.getAll().then((r) => {
      if (alive && r.success) setVotes(r.data ?? [])
    })
    return () => {
      alive = false
    }
  }, [version])

  const roots = rows.filter((q) => !q.source_request)
  // 画面に出すのは未対応だけ(対応済み・見送りは一覧にだけ残す。2026-10-24 利用者: 対象がないのにピンが残っているのが不思議だった)。
  // 一覧の「この画面を開く」で開いたものは、状態によらず出す(人が開きに来たもの)
  const isOpen = (q: DevRequest) => !q.status || q.status === 'open'
  const linked = target && 'id' in target ? target.id : null
  const here = roots.filter((q) => q.screen === screen && (isOpen(q) || q.id === linked))
  const pending = target && 'pending' in target ? target.pending : null

  // 位置は、画面の中身・スクロール・大きさが変わるたびに変わるので、間隔を空けて測り直す(プレビューのピンと同じ)
  // 一覧の「この画面を開く」などで開いたリクエスト。この画面のものでなくても、置き場に出してフロートを付ける(どこにも出ないことがないように)
  const openId = target && 'id' in target ? target.id : null
  const opened = openId ? roots.find((q) => q.id === openId) : undefined
  const openedElsewhere = !!opened && opened.screen !== screen
  const hereKey = here.map((q) => q.id).join(',') + (pending ? `|${pending.view_x}:${pending.view_y}` : '') + `|${openId ?? ''}`
  const live = useRef({ here, pending, openId })
  useEffect(() => {
    live.current = { here, pending, openId }
  })
  // 開いたリクエストの目印を、画面に見えるところまで一度だけ送る(開き直すとスクロールが戻り、目印がペインの外に隠れていることがあるため)
  const scrolledTo = useRef<string | null>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const inFloat = /^(card|production|result):|^alerts$/.test(screen)
  useEffect(() => {
    const update = () => {
      const next: { id: string; left: number; top: number }[] = []
      const lost: string[] = []
      for (const q of live.current.here) {
        let p = locate(q)
        if (!p) lost.push(q.id)
        else if (uncovered(p.left, p.top, q.anchor, layerRef.current, inFloat)) next.push({ id: q.id, ...p })
        else if (q.id === live.current.openId) {
          // 開いたリクエストは、隠れていても出す(人が開きに来たもの。2026-10-24、一覧の「この画面を開く」で開いてもピンが出なかった)。
          // 目印がスクロールの外なら、見えるところまで送ってから測り直す
          if (q.anchor && scrolledTo.current !== q.id) {
            scrolledTo.current = q.id
            try {
              document.querySelector(q.anchor)?.scrollIntoView({ block: 'center', inline: 'center' })
            } catch {
              // 目印の書き方が古い(querySelector が投げる)ときは、そのまま
            }
            p = locate(q) ?? p
          }
          next.push({ id: q.id, ...p })
        }
      }
      const pd = live.current.pending
      if (pd) {
        const p = locate(pd)
        if (p) next.push({ id: 'pending', ...p })
      }
      // 測った点は、表示の大きさ(画面全体の CSS の zoom。X60)を掛けたあとの px。ピンの層の中に置く値は掛ける前の px なので、倍率で割る
      // (割らないと、表示を小さくしたときに、押した所より左上にピンが刺さる。2026-10-26 利用者の報告。保存する割合は、どちらも掛けたあとの px で測るので、そのままでよい)
      const z = getUiScale()
      const placed = z === 1 ? next : next.map((p) => ({ ...p, left: p.left / z, top: p.top / z }))
      setSpots((o) => (JSON.stringify(o) === JSON.stringify(placed) ? o : placed))
      setMissing((o) => (o.join(',') === lost.join(',') ? o : lost))
    }
    update()
    const timer = window.setInterval(update, 500)
    return () => window.clearInterval(timer)
  }, [hereKey, screen, inFloat])

  // 右クリックの「開発に伝える」(どのメニューにも足す)
  const linkRef = useRef({ link, cardName, hostClass: s.host })
  useEffect(() => {
    linkRef.current = { link, cardName, hostClass: s.host }
  })
  const begin = useCallback((x: number, y: number) => {
    const { link: l, cardName: name, hostClass } = linkRef.current
    const place = capturePlace(x, y, name)
    const head = screenLabel(l, name)
    // 書いたときの様子を残す(画像は、書くまでの間に作っておく。開発へのリクエストのピンの層は写さない)
    startCaptureAt(devCaptureKey(place.view_x, place.view_y), x, y, place.anchor ? document.querySelector(place.anchor) : null, (el) => el.classList.contains(hostClass))
    setTarget({ pending: { ...place, screen: screenKey(l), url: window.location.search, place_text: [head, place.partLabel].filter(Boolean).join(' > ') } })
  }, [])
  useEffect(() => {
    setGlobalMenuItems((x, y) => [{ key: 'dev-request', label: tr('ピンを打って、開発へのリクエストを書く', 'Pin here and write a request to developers'), icon: <LightbulbRegular />, onSelect: () => begin(x, y) }])
    return () => setGlobalMenuItems(null)
  }, [begin])
  // メニューのない所の右クリック: 「開発に伝える」だけのメニュー。ほかの右クリックが受けたもの・ブラウザのメニューの逃げ道は、そのまま
  // (window で受けて、document で受けるほかのメニューのあとに動かす)
  const ctx = useContextMenu()
  const { openAt } = ctx
  useEffect(() => {
    const on = (e: MouseEvent) => {
      if (e.defaultPrevented || keepBrowserMenu(e)) return
      if ((e.target as Element | null)?.closest?.('[role="menu"], [role="dialog"] [role="menuitem"]')) return
      e.preventDefault()
      openAt(e.clientX, e.clientY, [])
    }
    window.addEventListener('contextmenu', on)
    return () => window.removeEventListener('contextmenu', on)
  }, [openAt])

  const byId = new Map(roots.map((q) => [q.id, q]))
  const close = () => {
    forgetLinkedRequest()
    setTarget(null)
  }
  const lost = [...missing.map((id) => byId.get(id)).filter((q): q is DevRequest => !!q), ...(openedElsewhere && opened ? [opened] : [])]
  // 一覧から開いたリクエストの場所が見つからない(画面の作りが変わった・別の画面のもの)ときは、置き場を開いて、そこにフロートを付ける
  const trayShown = trayOpen || (!!openId && (missing.includes(openId) || openedElsewhere))

  // テーマの色(CSS の変数)が届くよう、Fluent の Portal に出す(document.body に直接出すと、色が付かない)
  return (
    <Portal mountNode={{ className: s.host }}>
    <div ref={layerRef} className={s.layer}>
      {ctx.menu}
      {spots.map((p) => {
        if (p.id === 'pending')
          return (
            <span key="pending" data-pin-id="dr:pending" className={mergeClasses(s.pin, s.pinNew)} style={{ left: p.left, top: p.top }}>
              <span className={s.pinIcon}>+</span>
            </span>
          )
        const q = byId.get(p.id)
        if (!q) return null
        const n = votesOf(votes, q.id).length
        return (
          <span key={p.id} style={{ display: 'contents' }}>
          {n > 0 && (
            <span className={s.votes} style={{ left: p.left, top: p.top }} aria-hidden>
              {n}
            </span>
          )}
          <button
            type="button"
            data-pin-id={`dr:${p.id}`}
            className={mergeClasses(s.pin, q.status === 'done' && s.pinDone, q.status === 'declined' && s.pinDeclined)}
            style={{ left: p.left, top: p.top }}
            title={`${q.author_name || t('(名前なし)', '(no name)')}: ${(q.body ?? '').split('\n')[0]}`}
            aria-label={t('開発へのリクエストを開く', 'Open the request to developers')}
            onClick={(e) => {
              e.stopPropagation()
              setTarget({ id: q.id })
            }}
          >
            <span className={s.pinIcon}>{q.status === 'done' ? <CheckmarkRegular /> : q.status === 'declined' ? <DismissRegular /> : <LightbulbFilled />}</span>
          </button>
          </span>
        )
      })}
      {lost.length > 0 && (
        <div className={s.tray}>
          <Popover open={trayShown} onOpenChange={(_, d) => setTrayOpen(d.open)} positioning="above-start">
            <PopoverTrigger disableButtonEnhancement>
              <Button size="small" icon={<LocationOffRegular />}>
                {t(`場所が見つからないリクエスト ${lost.length}`, `${lost.length} requests whose spot is gone`)}
              </Button>
            </PopoverTrigger>
            <PopoverSurface>
              <div className={s.trayList}>
                <span className={s.trayPlace}>{t('画面の作りが変わり、ピンの場所が見つかりません。書いたときの場所の文を出しています。', 'The screen changed and the pin spot is gone. Showing where it was written.')}</span>
                {lost.map((q) => (
                  <button key={q.id} type="button" data-pin-id={`dr:${q.id}`} className={s.trayItem} onClick={() => setTarget({ id: q.id })}>
                    <span className={s.trayPlace}>{q.place_text}</span>
                    <span className={s.trayBody}>{q.body}</span>
                  </button>
                ))}
              </div>
            </PopoverSurface>
          </Popover>
        </div>
      )}
      {target && <DevRequestFloat key={'id' in target ? target.id : 'pending'} target={target} rows={rows} votes={votes} onTarget={setTarget} onClose={close} />}
    </div>
    </Portal>
  )
}

/** リクエストのフロート(打ったら書く・刺さっているものを読む・返信する)。見た目はレビューのピンと同じ PinThreadView */
function DevRequestFloat({ target, rows, votes, onTarget, onClose }: { target: Target; rows: DevRequest[]; votes: DevRequestVote[]; onTarget: (t: Target) => void; onClose: () => void }) {
  const s = useStyles()
  const t = useT()
  const name = useSyncExternalStore(onDevRequestName, devRequestName)
  const [nameEdit, setNameEdit] = useState<string | null>(name ? null : '')
  const [text, setText] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = 'id' in target ? target.id : null
  const pending = 'pending' in target ? target.pending : null
  const { target: anchor, positioningRef } = usePinAnchor(() => document, id ? `dr:${id}` : 'dr:pending')
  const root = id ? rows.find((q) => q.id === id) : undefined
  const replies = root ? rows.filter((q) => q.source_request === root.id) : []
  const author = (nameEdit ?? name).trim()
  const rootVotes = root ? votesOf(votes, root.id) : []
  const mineVoted = !!author && rootVotes.some((v) => (v.voter_name ?? '').trim() === author)
  const vote = async () => {
    if (!root) return
    if (!author) {
      setNameEdit('')
      setError(tr('賛同するには、名前を入れてください(次からは聞きません)', 'Enter your name to agree (asked only once)'))
      return
    }
    setWorking(true)
    setError(null)
    try {
      if (nameEdit !== null) {
        setDevRequestName(author)
        setNameEdit(null)
      }
      await toggleVote(root.id, author, votes)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setWorking(false)
    }
  }

  const send = async () => {
    const body = text.trim()
    if (!body) return
    if (!author) {
      setError(tr('名前を入れてください(次からは聞きません)', 'Enter your name (asked only once)'))
      return
    }
    setWorking(true)
    setError(null)
    try {
      if (nameEdit !== null) {
        setDevRequestName(author)
        setNameEdit(null)
      }
      if (pending) {
        const p = pending
        const r = await DevRequestsService.create({
          body,
          author_name: author,
          status: 'open',
          screen: p.screen,
          url: p.url,
          place_text: p.place_text,
          anchor: p.anchor,
          anchor_x: p.anchor_x,
          anchor_y: p.anchor_y,
          view_x: p.view_x,
          view_y: p.view_y,
          delivery_card_id: cardOf(p.screen),
        })
        if (!r.success || !r.data) throw new Error(r.error?.message ?? tr('保存できませんでした', 'Could not save'))
        const created = r.data.id
        attachCapture(devCaptureKey(p.view_x, p.view_y), (stored) => DevRequestsService.update(created, { anchor_image: stored }), bumpDevRequests)
        setText('')
        bumpDevRequests()
        onTarget({ id: r.data.id })
      } else if (root) {
        const r = await DevRequestsService.create({ source_request: root.id, body, author_name: author })
        if (!r.success) throw new Error(r.error?.message ?? tr('保存できませんでした', 'Could not save'))
        setText('')
        bumpDevRequests()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setWorking(false)
    }
  }

  const remove = async () => {
    if (!root) return
    setWorking(true)
    setError(null)
    try {
      if (await deleteDevRequest(root.id, rows)) onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setWorking(false)
    }
  }

  return (
    <PinThreadView
      target={anchor}
      positioningRef={positioningRef}
      ariaLabel={t('開発へのリクエスト', 'Request to developers')}
      badge={
        <span className={s.badgeIcon}>
          <LightbulbFilled style={{ transform: 'rotate(-45deg)' }} />
        </span>
      }
      place={root?.place_text ?? pending?.place_text ?? ''}
      // 削除は「⋯」の中に(誤って押さないように)。ログインしている人なら誰でも消せる(deleteDevRequest)。
      // メニューは inline で、フロートの中に描く(外に描くと、押したときにフロートの「外を押した」で閉じてしまう)
      headActions={
        root && (
          <Menu inline>
            <MenuTrigger disableButtonEnhancement>
              <Button size="small" appearance="subtle" icon={<MoreHorizontalRegular />} aria-label={t('その他の操作', 'More actions')} disabled={working} />
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem icon={<DeleteRegular />} onClick={() => void remove()}>
                  {t('削除', 'Delete')}
                </MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
        )
      }
      state={id && !root ? (rows.length ? 'gone' : 'loading') : 'ok'}
      goneText={t('このリクエストは消されました', 'This request was deleted')}
      entries={root ? [root, ...replies].map((q) => ({ id: q.id, author: q.author_name, body: q.body, at: q.created_on, isReply: q !== root })) : []}
      dimmed={root?.status === 'done' || root?.status === 'declined'}
      composerTop={
        <>
          {root?.anchor_image && (
            <div className={s.then}>
              <span>{t('書いたときの様子', 'How it looked when written')}</span>
              <PinThenImage stored={root.anchor_image} />
            </div>
          )}
          {root && (
            <span className={s.status}>
              <Badge appearance="tint" color={root.status === 'done' ? 'success' : root.status === 'declined' ? 'subtle' : 'important'} size="small">
                {statusText(root)}
              </Badge>
              {/* 賛同(いいね)。1 人 1 回、もう一度押すと取り消す */}
              <Button size="small" appearance={mineVoted ? 'primary' : 'outline'} icon={mineVoted ? <ThumbLikeFilled /> : <ThumbLikeRegular />} disabled={working} onClick={() => void vote()}>
                {t(`賛同する ${rootVotes.length}`, `Agree ${rootVotes.length}`)}
              </Button>
              {rootVotes.length > 0 && <span className={s.voters}>{rootVotes.map((v) => v.voter_name).join('、')}</span>}
            </span>
          )}
          {nameEdit !== null ? (
            <Field label={t('あなたの名前(リクエストに残します。ブラウザが覚えます)', 'Your name (kept with requests; remembered in this browser)')} size="small">
              <Input size="small" value={nameEdit} onChange={(_, d) => setNameEdit(d.value)} placeholder={t('例: 山田', 'e.g. Alex')} />
            </Field>
          ) : (
            <span className={s.nameRow}>
              {t(`${name} として書く`, `Writing as ${name}`)}
              <Button size="small" appearance="transparent" onClick={() => setNameEdit(name)}>
                {t('(変える)', '(change)')}
              </Button>
            </span>
          )}
        </>
      }
      text={text}
      onText={setText}
      placeholder={root ? t('返信', 'Reply') : t('直してほしいこと・足してほしいこと', 'What should be fixed or added')}
      sendLabel={root ? t('返信する', 'Send reply') : t('開発に伝える', 'Send to developers')}
      working={working}
      onSend={() => void send()}
      error={error}
      onClose={onClose}
    />
  )
}

/** 書いたときの様子の画像の鍵(打ってから書くまでの間に作っておく。pinSnapshot) */
const devCaptureKey = (viewX: number, viewY: number) => `dev|${viewX}|${viewY}`

/** 画面の鍵から、配信カード(・制作のページ・結果)の ID を取る(リクエストの表の配信カードへの参照) */
const cardOf = (screen: string): string | undefined => {
  const m = /^(?:card|production|result):(.+)$/.exec(screen)
  return m?.[1]
}
