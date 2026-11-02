// 面の枠(X90 の塊 A。2026-11-02 利用者: 「Plan と Production の UI に差を付けない(シームレス)」)。
// 計画(配信カード)・制作・結果のシンプルな画面は、どれもこの枠に載せる。枠が持つのは、上の帯(題・タブ・状態の札・保存の様子・↶・主のボタンの置き場所・⋯・×)、
// 帯の下のお知らせ、左のバーと開いたパネル、プレビュー(道具の行・スマホ / PC・ピン・ピンを打つ間の帯・倍率・つかんで動かす)、右のペインの枠と幅。
// 面ごとに差し込むのは「左のバーの項目」「道具の行の左」「ペインの中身」「主のボタン」「⋯ の中身」だけにする(1 つずつ直すと、また離れるため)。
// 倍率と幅は、面で 1 つの鍵(面を切り替えても、同じ倍率・同じ幅のまま)
import type { ComponentProps, ReactNode, RefObject } from 'react'
import { Button, MessageBar, MessageBarBody, ToggleButton, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowClockwiseRegular, ArrowUndoRegular, ChevronDoubleLeftRegular, CommentAddRegular, DesktopRegular, DismissRegular, PhoneRegular } from '@fluentui/react-icons'
import { locale, useT } from '../i18n'
import { Splitter } from '../Splitter'
import { ResolvedPinsToggle } from '../ResolvedPinsToggle'
import { typo } from '../typo'
import { StageHeader } from './StageHeader'
import { PreviewZoomBar } from './PreviewZoomBar'
import { usePreviewNav, type PreviewZoom } from './usePreviewNav'
import { RAIL_W, SIDE_W, type StageLayout } from './stageLayout'
import { CampaignBand } from '../CampaignBand'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  notices: { display: 'grid', rowGap: '4px' },
  saveFailed: { display: 'inline-flex', alignItems: 'center', columnGap: '2px', whiteSpace: 'nowrap' },
  saveFailedText: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1, fontWeight: tokens.fontWeightSemibold },
  saved: { color: tokens.colorPaletteGreenForeground1 },
  saveState: { fontSize: '12px', color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap', flexShrink: 0 },
  panes: {
    flexGrow: 1,
    minHeight: 0,
    display: 'grid',
    // 左のバー + 開くパネル | プレビュー | 選んだ部品 | (右端の列)。開いたパネルは、つかんで決めた幅のまま(縮めると、幅を変えても広がらないため)。
    // 狭い画面では、選んだ部品のペインと右端の列が縮む
    gridTemplateColumns: `${SIDE_W}px var(--ws) 1px var(--wv) 1px minmax(280px, 1fr)`,
    gridTemplateRows: 'minmax(0, 1fr)',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: 'hidden',
  },
  panesList: { gridTemplateColumns: `${SIDE_W}px var(--ws) 1px var(--wv) 1px minmax(280px, 1fr) 1px minmax(0, var(--wl))` },
  // パネルを開く・しまう間だけ、列の幅を動かす(引き出しのように、左のバーへしまわれる)
  panesMoving: { transitionProperty: 'grid-template-columns', transitionDuration: '200ms', transitionTimingFunction: 'ease-out', '@media (prefers-reduced-motion: reduce)': { transitionDuration: '0ms' } },
  pane: { minHeight: 0, overflow: 'auto', padding: '12px 14px', backgroundColor: tokens.colorNeutralBackground1 },
  // 左のバーと、開くパネル
  sideOverlay: { position: 'relative', zIndex: 3, boxShadow: tokens.shadow16, borderRight: `1px solid ${tokens.colorNeutralStroke2}` },
  sidePane: { display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minHeight: 0, minWidth: 0, overflow: 'hidden', backgroundColor: tokens.colorNeutralBackground1 },
  sideHead: { display: 'flex', alignItems: 'center', columnGap: '6px', padding: '6px 6px 6px 12px', ...typo.heading, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, whiteSpace: 'nowrap', overflow: 'hidden' },
  sideTitle: { flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis' },
  sideBody: { display: 'grid', minHeight: 0, minWidth: 0, overflow: 'hidden' },
  // 上から 道具の行・(知らせ)・受信箱の 1 行・プレビュー。行の数が変わってもプレビューが残りの高さを取るよう、縦の flex
  // isolation: プレビューの上に浮かべたもの(スマホ / PC・ピン・倍率。zIndex 5)の重なりを、この枠の中に閉じる。
  // 閉じないと、狭い画面でプレビューに重ねて出す左のパネル(sideOverlay。zIndex 3)より上に出ていた(2026-11-02 UI 3 が見つけた)
  previewPane: { display: 'flex', flexDirection: 'column', rowGap: '6px', minHeight: 0, minWidth: 0, padding: '8px 12px 10px', backgroundColor: tokens.colorNeutralBackground2, isolation: 'isolate' },
  toolbar: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap' },
  // プレビューの枠。ピン・印と同じく、重ねる層の基準にする(position: relative)
  boxWrap: { position: 'relative', flexGrow: 1, minHeight: 0, display: 'grid' },
  // ピンを打つ状態のあいだの案内の帯(X73。マウスの形だけでは、何を待っているか分からないため)
  // 左上・右上のボタンに重ならないよう、ボタンの下に出す
  placingBar: { position: 'absolute', left: '50%', top: '44px', transform: 'translateX(-50%)', zIndex: 6, maxWidth: 'calc(100% - 28px)', boxShadow: tokens.shadow8 },
  tipSub: { display: 'block', marginTop: '2px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  pinBox: { position: 'absolute', right: '14px', top: '6px', zIndex: 5, display: 'flex', padding: '2px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow4 },
  viewBox: { position: 'absolute', left: '6px', top: '6px', zIndex: 5, display: 'flex', columnGap: '2px', padding: '2px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow4 },
  // 部品の外の地は、つかんで動かせる(手のひら)。部品は押して選ぶ(指)。押したら Tab・Esc が効くよう、フォーカスを受け取る
  box: {
    position: 'relative',
    overflow: 'auto',
    minHeight: 0,
    paddingTop: '8px',
    paddingBottom: '48px',
    outline: 'none',
    cursor: 'grab',
    '& [data-part], & [data-item-key]': { cursor: 'pointer' },
  },
  boxPanning: { cursor: 'grabbing', userSelect: 'none', '& [data-part], & [data-item-key]': { cursor: 'grabbing' } },
  boxSpace: { cursor: 'grab', '& [data-part], & [data-item-key]': { cursor: 'grab' } },
})

/** 保存した時刻(上の帯の「保存済み · 12:03」。今日でなければ日付も) */
const savedTime = (iso: string) => {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return d.toLocaleString(locale(), today ? { hour: '2-digit', minute: '2-digit' } : { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** 保存の様子(入力が止まって約 1.5 秒で自動で保存する)。unsaved = まだ配信になっていない案(自動では保存しない) */
export interface SaveInfo {
  saving: boolean
  unsaved?: boolean
  dirty: boolean
  savedAt?: string | null
  justSaved?: boolean
}

/** 保存で手を打つことがあるとき(ほかの人が先に保存した・保存できなかった) */
export interface SaveProblem {
  conflict?: { at?: string; overwrite: () => void; reload: () => void } | null
  error?: string | null
  retry?: () => void
}

function SaveStateText({ save }: { save: SaveInfo }) {
  const t = useT()
  const s = useStyles()
  const text = save.saving ? (
    t('保存中…', 'Saving…')
  ) : save.unsaved ? (
    // まだ配信になっていない案(自動では保存しない。「この案で作る」で作る)
    t('まだ保存していません', 'Not saved yet')
  ) : save.dirty ? (
    t('未保存', 'Unsaved')
  ) : save.savedAt ? (
    <span className={mergeClasses(save.justSaved && s.saved)}>{t(`保存済み · ${savedTime(save.savedAt)}`, `Saved · ${savedTime(save.savedAt)}`)}</span>
  ) : null
  return text ? <span className={s.saveState}>{text}</span> : null
}

function SaveProblemBar({ problem }: { problem: SaveProblem }) {
  const t = useT()
  const s = useStyles()
  const c = problem.conflict
  if (c)
    // ほかの人が先に保存していた: 黙って上書きせず、どうするかを聞く
    return (
      <span className={s.saveFailed}>
        <Tooltip
          content={t(
            `ほかの人が、この配信を先に保存しました${c.at ? `(${c.at})` : ''}。上書きすると、その変更は消えます。閉じて読み直すと、ほかの人の中身を開けます(こちらの変更は消えます)`,
            `Someone else saved this delivery first${c.at ? ` (${c.at})` : ''}. Overwriting discards their changes; closing and reloading discards yours.`,
          )}
          relationship="description"
        >
          <span className={s.saveFailedText}>{t('ほかの人が先に保存しました', 'Someone else saved first')}</span>
        </Tooltip>
        <Button type="button" size="small" appearance="subtle" onClick={c.overwrite}>
          {t('上書きする', 'Overwrite')}
        </Button>
        <Button type="button" size="small" appearance="subtle" onClick={c.reload}>
          {t('閉じて読み直す', 'Close and reload')}
        </Button>
      </span>
    )
  if (problem.error)
    // 保存の失敗は、作業している所から見える上の帯に(以前はペインのいちばん下で、画面の外になっていた)
    return (
      <span className={s.saveFailed}>
        <Tooltip content={problem.error} relationship="description">
          <span className={s.saveFailedText}>{t('保存できませんでした', 'Could not save')}</span>
        </Tooltip>
        {problem.retry && (
          <Button type="button" size="small" appearance="subtle" icon={<ArrowClockwiseRegular />} onClick={problem.retry}>
            {t('再試行', 'Retry')}
          </Button>
        )}
      </span>
    )
  return null
}

/**
 * キャンペーンの帯(X79)に渡すもの。案の段(variants)と右の端の × は、枠が入れる(3 つの面で同じ場所に出すため)。
 * actions は × の前に置くもの(計画: まとめて承認・キャンペーンのメニュー)、addVariantItems は ＋ のメニューの「AB テストを足す」
 */
export type StageCampaign = Omit<ComponentProps<typeof CampaignBand>, 'slots'> & { addVariantItems?: ReactNode }

interface FrameProps {
  /** キャンペーンの帯(X79。上の帯より上)。キャンペーンに入っていない配信は省く(× は題の行の右の端、案は題の帯の 2 段目) */
  campaign?: StageCampaign
  /** AB テストの案の切り替え(VariantTabs)。キャンペーンの帯があれば案の段、なければ題の帯の 2 段目 */
  variants?: ReactNode
  channel?: string
  /** 題(キャンペーン名か配信名) */
  name: ReactNode
  when: ReactNode
  /** 面のタブ(PLAN | PRODUCTION | RESULTS) */
  tabs?: ReactNode
  /** その面の状態の札(計画 = 承認、制作 = 制作の状態)。押すと、その面の状態のパネルを開く */
  status?: ReactNode
  save?: SaveInfo
  saveProblem?: SaveProblem
  /** ↶ の前に置くもの(計画: まだ保存していない案の「この案で作る」) */
  lead?: ReactNode
  /** 元に戻す(出さない面・場合は省く) */
  undo?: { disabled: boolean; onUndo: () => void }
  /** 主のボタン(その面で自分がやること。青は 1 つ) */
  primary?: ReactNode
  /** 主のボタンと ⋯ のあいだ(リンクをコピー など) */
  tools?: ReactNode
  /** ⋯(その面のほかの操作) */
  menu?: ReactNode
  /** 閉じる ×(キャンペーンの帯があれば帯の右の端、なければ題の行の右の端) */
  onClose: () => void
  /** 帯の下のお知らせ */
  notices?: ReactNode
  /** 列の並び(StagePanes) */
  children: ReactNode
}

/**
 * 面の枠の外側: キャンペーンの帯・上の帯(StageHeader)・お知らせ・列の並び。
 * 上の帯の右の並びは、保存の問題 → (lead) → ↶ → 主のボタン → (tools) → ⋯ → × で、どの面も同じ
 */
export function StageFrame({ campaign, variants, channel, name, when, tabs, status, save, saveProblem, lead, undo, primary, tools, menu, onClose, notices, children }: FrameProps) {
  const t = useT()
  const s = useStyles()
  // 閉じる ×: フロートのいちばん上の右の角(2026-10-27 利用者)。ボタンなので、題の行でつかんで動かす動き(floatMove)には入らない
  const close = <Button type="button" appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label={t('閉じる', 'Close')} />
  const { addVariantItems, actions: bandActions, ...band } = campaign ?? {}
  return (
    <div className={s.root}>
      {campaign && (
        <CampaignBand
          {...(band as Omit<StageCampaign, 'addVariantItems' | 'actions'>)}
          slots={{ variants, addVariantItems }}
          actions={
            <>
              {bandActions}
              {close}
            </>
          }
        />
      )}
      <StageHeader
        channel={channel}
        name={name}
        when={when}
        status={
          (status || save) && (
            <>
              {status}
              {save && <SaveStateText save={save} />}
            </>
          )
        }
        actions={
          <>
            {/* 保存の様子(保存中… / 未保存 / 保存済み)は、題の行の左の状態の札の横。ここには、手を打つことがあるとき(先に保存された・失敗)だけ */}
            {saveProblem && <SaveProblemBar problem={saveProblem} />}
            {lead}
            {undo && (
              <Tooltip content={t('元に戻す: 前に保存した中身に戻します(開いている間の履歴)', 'Undo: go back to the content before the last save (history while open)')} relationship="description">
                <Button type="button" size="small" appearance="subtle" icon={<ArrowUndoRegular />} disabled={undo.disabled} onClick={undo.onUndo} aria-label={t('元に戻す', 'Undo')} />
              </Tooltip>
            )}
            {primary}
            {tools}
            {menu}
            {!campaign && close}
          </>
        }
        tabs={tabs}
        tabsExtra={campaign ? undefined : variants}
      />
      <div className={s.notices}>{notices}</div>
      {children}
    </div>
  )
}

interface PanesProps {
  layout: StageLayout
  /** 開け閉めの動きの間(列の幅を動かす) */
  moving?: boolean
  /** 開いた直後、並べ終わるまで見せない */
  hidden?: boolean
  /** 左のバー(SideRail) */
  rail: ReactNode
  /** 開いたパネル。open = 開いているか(しまっても列には残し、中身も描いたまま) */
  side: { open: boolean; title: ReactNode; onCollapse: () => void; children: ReactNode }
  preview: ReactNode
  /** 右のペイン(StagePane) */
  pane: ReactNode
  /** 右端の列(計画の商品の一覧。開いていても畳んでいても、ここに渡す) */
  list?: ReactNode
}

/** 列の並び: 左のバー | 開いたパネル | プレビュー | 右のペイン | (右端の列)。境目はつかんで幅を変えられ、幅は面で 1 つの鍵で覚える */
export function StagePanes({ layout, moving, hidden, rail, side, preview, pane, list }: PanesProps) {
  const t = useT()
  const s = useStyles()
  const { fit, sideW, widths, hasList, onPanes, resizeSide, resizePreview, resizeList, saveWidths } = layout
  return (
    <div
      ref={onPanes}
      className={mergeClasses(s.panes, hasList && s.panesList, moving && s.panesMoving)}
      style={{ '--wv': `${fit.preview}px`, '--wl': `${fit.listOpen ? widths.list : RAIL_W}px`, '--ws': `${fit.overlay ? 0 : sideW}px`, visibility: hidden ? 'hidden' : undefined } as React.CSSProperties}
    >
      {rail}
      {/* 開いているパネル(1 つ)。しまったときも列には残し、幅 0 にする(display: none にすると、グリッドの列から外れ、プレビュー以下が 1 列ずつ左の細い列にずれる。2026-10-24 本番で起きた)。
          しまっている間は inert で、Tab で中に入らないようにする */}
      {/* 狭くて収まらないときは、列の幅を 0 にしたまま、パネルをプレビューの上に重ねて出す(fitPanes の ③) */}
      <div className={mergeClasses(s.sidePane, fit.overlay && s.sideOverlay)} style={fit.overlay ? { width: sideW } : undefined} inert={!side.open} aria-hidden={!side.open}>
        <div className={s.sideHead}>
          <span className={s.sideTitle}>{side.title}</span>
          {/* × で閉じるのではなく、左のバーへしまう(2026-10-24 利用者) */}
          <Tooltip content={t('パネルをしまう(バーのアイコンをもう一度押しても、しまえます)', 'Collapse the panel (or click its icon in the bar again)')} relationship="label">
            <Button type="button" size="small" appearance="subtle" icon={<ChevronDoubleLeftRegular />} onClick={side.onCollapse} />
          </Tooltip>
        </div>
        <div className={s.sideBody}>{side.children}</div>
      </div>
      <Splitter onDrag={side.open ? resizeSide : () => undefined} onDone={saveWidths} />
      {preview}
      <Splitter onDrag={resizePreview} onDone={saveWidths} />
      {pane}
      {hasList && (
        <>
          <Splitter onDrag={fit.listOpen ? resizeList : () => undefined} onDone={saveWidths} />
          {list}
        </>
      )}
    </div>
  )
}

/** 右のペイン(選んだ部品・全体)の枠。見出し(パンくずと ×)は、ペインの中身の側が持つ */
export function StagePane({ paneRef, children }: { paneRef?: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const s = useStyles()
  return (
    <div className={s.pane} ref={paneRef}>
      {children}
    </div>
  )
}

interface PreviewProps {
  boxRef: RefObject<HTMLDivElement | null>
  zoom: PreviewZoom
  /** 倍率の横の ⓘ(その面のキーの操作) */
  keysInfo?: string
  /** 道具の行の左(その面の見せ方。計画 = テンプレートの札) */
  toolbar?: ReactNode
  /** 道具の行とプレビューのあいだ(知らせ・配信の情報の帯・受信箱での見え方) */
  above?: ReactNode
  /** スマホ / PC の幅(メールだけ。アプリは省く) */
  device?: { value: 'mobile' | 'pc'; set: (d: 'mobile' | 'pc') => void }
  /** ピンを打つ(コメント)。打てないときは省く */
  pins?: { placing: boolean; setPlacing: (on: boolean) => void }
  /** プレビューの枠の読み上げの名前(キーの操作の案内) */
  boxLabel: string
  /** プレビューの中身と、重ねる層(ピン・印・部品を選ぶ層) */
  children: ReactNode
}

/** プレビューの枠: 道具の行・左上のスマホ / PC・右上のピン・ピンを打つ間の帯・倍率(右下)・つかんで動かす */
export function PreviewFrame({ boxRef, zoom, keysInfo, toolbar, above, device, pins, boxLabel, children }: PreviewProps) {
  const t = useT()
  const s = useStyles()
  const nav = usePreviewNav(boxRef, zoom)
  return (
    <div className={s.previewPane}>
      <div className={s.toolbar}>{toolbar}</div>
      {above}
      <div className={s.boxWrap}>
        {/* プレビューの左上 = 見え方(スマホ / PC の幅)、右上 = 書き込む(場所を押してコメント)。役割で分け、場所を取らないようアイコンだけ */}
        {device && (
          <div className={s.viewBox}>
            {(['mobile', 'pc'] as const).map((d) => (
              <Tooltip key={d} content={d === 'mobile' ? t('スマホの幅', 'Mobile width') : t('PC の幅', 'Desktop width')} relationship="label">
                <ToggleButton type="button" size="small" appearance={device.value === d ? 'primary' : 'subtle'} checked={device.value === d} icon={d === 'mobile' ? <PhoneRegular /> : <DesktopRegular />} onClick={() => device.set(d)} />
              </Tooltip>
            ))}
          </div>
        )}
        {pins && (
          <div className={s.pinBox}>
            {/* バルーンは 2 行(X73。1 行目に何ができるか、2 行目に打ち方。右クリックでも打てることを知らせる) */}
            <Tooltip
              content={
                pins.placing ? (
                  t('コメントを書く場所を押してください(Esc でやめる)', 'Click where to comment (Esc to cancel)')
                ) : (
                  <>
                    {t('ピンを打って、コメントを書く', 'Pin and write a comment')}
                    <span className={s.tipSub}>{t('押してから、プレビューの場所を押す。右クリックでも打てます', 'Press this, then click a spot in the preview. Right-click also works')}</span>
                  </>
                )
              }
              relationship="label"
            >
              <ToggleButton type="button" size="small" appearance={pins.placing ? 'primary' : 'subtle'} checked={pins.placing} icon={<CommentAddRegular />} onClick={() => pins.setPlacing(!pins.placing)} />
            </Tooltip>
            <ResolvedPinsToggle />
          </div>
        )}
        {pins?.placing && (
          <MessageBar intent="info" layout="multiline" className={s.placingBar}>
            <MessageBarBody>{t('コメントを書く場所を押してください(Esc でやめる)', 'Click where to write a comment (Esc to cancel)')}</MessageBarBody>
          </MessageBar>
        )}
        <div ref={boxRef} className={mergeClasses(s.box, nav.spaceDown && s.boxSpace, nav.panning && s.boxPanning)} tabIndex={0} aria-label={boxLabel}>
          {children}
        </div>
        {/* 倍率(Ctrl + ホイールでも。数字を押すと、全体表示と 100% を行き来する)。キーの操作の一覧は ⓘ に(案内の 3 つの置き方の 2) */}
        <PreviewZoomBar zoom={zoom} keysInfo={keysInfo} />
      </div>
    </div>
  )
}
