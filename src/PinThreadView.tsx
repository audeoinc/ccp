import { useRef, type ReactNode, type RefObject } from 'react'
import { Avatar, Button, Popover, PopoverSurface, Spinner, makeStyles, mergeClasses, tokens, type PositioningImperativeRef, type PositioningVirtualElement } from '@fluentui/react-components'
import { DismissRegular, SendRegular } from '@fluentui/react-icons'
import { AutoTextarea } from './AutoTextarea'
import { Linkify } from './LinkText'
import { useT, when } from './i18n'
import { ResizeHandles } from './ResizeHandles'
import { useFloatSize } from './floatLayout'
import { useFloatMove } from './floatMove'
import { PREF } from './prefKeys'

const useStyles = makeStyles({
  // 縦に並べ、中身は枠の幅に収める(長い場所の文・入力欄が、枠の外へ押し広げないように)。大きさは、右・下の端をつかんで変えられる。
  // 画面の高さを越えない(書いたときの様子の画像が入ると、返信の欄が枠の下にはみ出していた。2026-10-26 利用者の報告)
  surface: { width: '320px', maxHeight: 'calc(100vh / var(--ui-zoom, 1) - 24px)', boxSizing: 'border-box', padding: '10px 12px', display: 'flex', flexDirection: 'column', rowGap: '8px', '& > *': { minWidth: 0, flexShrink: 0 } },
  // 題の行。つかむとフロートを動かせる(floatMove)
  head: { display: 'flex', alignItems: 'center', columnGap: '6px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, cursor: 'move', userSelect: 'none', touchAction: 'none' },
  headText: { flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  // 元の書き込み・返信と、入力欄の上のもの(書いたときの様子の画像など)。枠に収まらないときは、この中だけスクロールし、
  // 入力欄と送るボタンは下に残す(縮むのはこの欄だけ。flexShrink は、枠の「子は縮めない」より強くするため、style で渡す)
  scroll: { display: 'flex', flexDirection: 'column', rowGap: '8px', flexGrow: 1, minHeight: 0, overflowY: 'auto' },
  thread: { display: 'grid', rowGap: '8px', alignContent: 'start' },
  entry: { display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)', columnGap: '8px', alignItems: 'start' },
  reply: { marginLeft: '16px' },
  meta: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  body: { fontSize: tokens.fontSizeBase300, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  done: { color: tokens.colorNeutralForeground3 },
  input: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: '6px', alignItems: 'end' },
  actions: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '4px' },
  hint: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, marginLeft: 'auto' },
  error: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1 },
})


/** フロートに並べる 1 件(元の書き込みか返信) */
export interface ThreadEntry {
  id: string
  author?: string
  body?: string
  at?: string
  /** 名前と時刻のあいだに足す文(宛先など) */
  extra?: string
  isReply?: boolean
}

interface Props {
  target: Element | PositioningVirtualElement | null
  positioningRef: RefObject<PositioningImperativeRef | null>
  ariaLabel: string
  /** 見出しの左の印(ピンの番号など) */
  badge: ReactNode
  place: string
  /** 見出しの右に並べるボタン(直す・消すなど。閉じるは、この部品が置く) */
  headActions?: ReactNode
  /** 'loading' = 読んでいる / 'gone' = 消された / 'ok' */
  state: 'loading' | 'gone' | 'ok'
  goneText: string
  entries: ThreadEntry[]
  /** 解決・対応済みなどで、本文を薄くする */
  dimmed?: boolean
  /** 入力欄の上(宛先・書く人の名前など) */
  composerTop?: ReactNode
  text: string
  onText: (v: string) => void
  placeholder: string
  sendLabel: string
  working: boolean
  onSend: () => void
  /** 入力欄の下の左(解決にする など) */
  footer?: ReactNode
  error?: string | null
  onClose: () => void
}

/**
 * ピンのフロートの見た目(コメントのピン PinFloat と、開発へのリクエストのピン DevRequestFloat で共通)。
 * 中身(何を読み、どこに書くか)は使う側が持ち、ここは並べ方と操作の形だけを持つ(2 つのピンで、読み方・返し方がずれないように)
 */
export function PinThreadView(p: Props) {
  const s = useStyles()
  const t = useT()
  // 大きさは、コメントのピン・リクエストのピンで共通に覚える(やり取りが長いと読みにくいため。2026-10-23 利用者)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const size = useFloatSize(PREF.pinFloatSize, surfaceRef, { w: 280, h: 200 })
  // 題の行をつかんで動かす(ピンの横に出たフロートが、確かめたい所を隠すため。2026-10-26 利用者)
  const move = useFloatMove(surfaceRef)
  if (!p.target) return null
  return (
    <Popover
      open
      positioning={{ target: p.target, positioningRef: p.positioningRef, position: 'after', align: 'top', offset: 8 }}
      withArrow
      trapFocus={false}
      onOpenChange={(ev, d) => {
        // 別のピンを押したときは、そのピンが開き直す(ここで閉じると、押した順によっては開かない)
        if (!d.open && !(ev.target instanceof Element && ev.target.closest('[data-pin-id]'))) p.onClose()
      }}
    >
      {/* data-pin-thread: 書いたときの様子を写すとき、このフロートは写さない(pinSnapshot) */}
      <PopoverSurface ref={surfaceRef} data-pin-thread className={s.surface} style={{ ...size.style, ...move.style }} aria-label={p.ariaLabel}>
        <ResizeHandles {...size.handles} anchored />
        <div className={s.head} onPointerDown={move.startMove}>
          {p.badge}
          <span className={s.headText} title={p.place}>{p.place}</span>
          {p.headActions}
          <Button size="small" appearance="subtle" icon={<DismissRegular />} onClick={p.onClose} aria-label={t('閉じる', 'Close')} />
        </div>
        {p.state !== 'ok' ? (
          p.state === 'loading' ? <Spinner size="tiny" /> : <span className={s.meta}>{p.goneText}</span>
        ) : (
          <>
            <div className={s.scroll} style={{ flexShrink: 1 }}>
              {p.entries.length > 0 && (
                <div className={s.thread}>
                  {p.entries.map((n) => (
                    <div key={n.id} className={mergeClasses(s.entry, n.isReply && s.reply)}>
                      <Avatar size={24} name={n.author || '?'} color="colorful" />
                      <div style={{ minWidth: 0 }}>
                        <div className={s.meta}>{[n.author || t('(名前なし)', '(no name)'), n.extra ?? '', when(n.at)].filter(Boolean).join(' · ')}</div>
                        <div className={mergeClasses(s.body, !!p.dimmed && s.done)}><Linkify text={n.body} /></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {p.composerTop}
            </div>
            <div className={s.input}>
              <AutoTextarea heightKey="PinThreadView.p_text"
                size="small"
                rows={p.entries.length ? 1 : 2}
                autoFocus
                value={p.text}
                disabled={p.working}
                placeholder={p.placeholder}
                onChange={(_, d) => p.onText(d.value)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
                    ev.preventDefault()
                    p.onSend()
                  }
                }}
              />
              <Button size="small" appearance="primary" icon={p.working ? <Spinner size="extra-tiny" /> : <SendRegular />} disabled={p.working || !p.text.trim()} onClick={p.onSend} aria-label={p.sendLabel} />
            </div>
            <div className={s.actions}>
              {p.footer}
              <span className={s.hint}>{t('Ctrl + Enter で送る', 'Ctrl + Enter to send')}</span>
            </div>
          </>
        )}
        {p.error && <span className={s.error}>{p.error}</span>}
      </PopoverSurface>
    </Popover>
  )
}
