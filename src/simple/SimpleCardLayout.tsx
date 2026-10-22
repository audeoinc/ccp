import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { Badge, Button, Spinner, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowUndoRegular, ChevronLeftRegular, ChevronRightRegular, DesktopRegular, DismissRegular, LayoutColumnTwoRegular, PhoneRegular, SaveRegular } from '@fluentui/react-icons'
import { ChannelBadge } from '../ChannelBadge'
import { ProductInfoPane } from '../ProductInfoPane'
import { PreviewPartPicker } from '../PreviewPartPicker'
import { Splitter } from '../Splitter'
import { ImageThumb } from '../ImageThumb'
import { ALERT_COLOR } from '../alertColors'
import { productImage } from '../images'
import { locale, optionLabel, useT } from '../i18n'
import { loadPref, savePref } from '../settings'
import { countryOptions, statusColor, statusLabel } from '../status'
import { getTemplate } from '../templates'
import { targetText } from '../target'
import { NextAction } from './NextAction'
import type { NextStep } from './nextStep'
import { PartPane } from './PartPane'
import { placeInPart } from './actions'
import { partKey, samePart, type PartRef } from './parts'
import type { SimpleEditor } from './editor'

// 選んだ部品・商品の一覧のペインの幅と、商品の一覧の開閉(人の設定。ARCHITECTURE の 8 章)
const WIDTH_KEY = 'simpleCard.paneWidths.v1'
const PRODUCTS_KEY = 'simpleCard.productsOpen'
const RAIL_W = 32
const clampW = (v: number) => Math.min(640, Math.max(240, v))

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  // 上の帯: 配信名・配信日時・チャネル・ステータス と、次にやること・⋯
  top: { display: 'flex', alignItems: 'center', columnGap: '8px', padding: '10px 12px 10px 20px', minWidth: 0 },
  topField: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '6px',
    minWidth: 0,
    padding: '2px 8px',
    border: '1px solid transparent',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    color: tokens.colorNeutralForeground1,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover, borderTopColor: tokens.colorNeutralStroke2, borderRightColor: tokens.colorNeutralStroke2, borderBottomColor: tokens.colorNeutralStroke2, borderLeftColor: tokens.colorNeutralStroke2 },
  },
  on: { backgroundColor: tokens.colorBrandBackground2, borderTopColor: tokens.colorBrandStroke1, borderRightColor: tokens.colorBrandStroke1, borderBottomColor: tokens.colorBrandStroke1, borderLeftColor: tokens.colorBrandStroke1 },
  name: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '360px' },
  // 配信名だけは、狭いときに縮めて「…」にする(ほかの項目とボタンは、縮めない)
  nameField: { flexShrink: 1, minWidth: '80px' },
  dot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },
  grow: { flexGrow: 1 },
  state: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  saved: { color: tokens.colorPaletteGreenForeground1 },
  // 概要の帯: 送られる中身と見間違えないよう、メールの枠の外に、地の色を変えて置く
  overview: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: '4px',
    rowGap: '4px',
    padding: '6px 20px',
    backgroundColor: tokens.colorNeutralBackground3,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  overviewLabel: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3, marginRight: '4px', whiteSpace: 'nowrap' },
  chip: { fontSize: tokens.fontSizeBase200, maxWidth: '320px' },
  chipKey: { color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  chipVal: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  empty: { color: tokens.colorNeutralForeground4 },
  notices: { display: 'grid', rowGap: '4px' },
  panes: {
    flexGrow: 1,
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: `minmax(360px, 1fr) 1px var(--wp) 1px var(--wl) 1px ${RAIL_W}px`,
    gridTemplateRows: 'minmax(0, 1fr)',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: 'hidden',
  },
  pane: { minHeight: 0, overflow: 'auto', padding: '12px 14px', backgroundColor: tokens.colorNeutralBackground1 },
  previewPane: { display: 'grid', gridTemplateRows: 'auto auto minmax(0, 1fr)', rowGap: '6px', minHeight: 0, padding: '10px 12px', backgroundColor: tokens.colorNeutralBackground2 },
  toolbar: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap' },
  deviceBtn: { minWidth: 'auto', height: '24px', padding: '0 8px', fontWeight: tokens.fontWeightRegular },
  // 受信箱の 1 行(差出人・件名・プリヘッダー)。プレビューに写らないものを押して直せるように
  inbox: { display: 'flex', alignItems: 'center', columnGap: '10px', padding: '6px 10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, minWidth: 0 },
  sender: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase200, flexShrink: 0 },
  inboxPart: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '2px 6px', borderRadius: tokens.borderRadiusSmall, border: '1px solid transparent', backgroundColor: 'transparent', fontFamily: 'inherit', fontSize: tokens.fontSizeBase300, cursor: 'pointer', textAlign: 'left', color: tokens.colorNeutralForeground1, ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  inboxSub: { color: tokens.colorNeutralForeground3, flexShrink: 1 },
  // プレビューの枠。ピン・印と同じく、重ねる層の基準にする(position: relative)。押したら Tab・Esc が効くよう、フォーカスを受け取る
  box: { position: 'relative', overflow: 'auto', minHeight: 0, paddingTop: '8px', paddingBottom: '8px', outline: 'none' },
  rail: { display: 'flex', flexDirection: 'column', alignItems: 'center', rowGap: '8px', paddingTop: '10px', minHeight: 0, overflow: 'hidden', backgroundColor: tokens.colorNeutralBackground2 },
  railLabel: { writingMode: 'vertical-rl', color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, letterSpacing: '0.1em' },
  railDot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, border: 'none', padding: 0, cursor: 'pointer' },
  listHead: { display: 'flex', justifyContent: 'flex-end', marginBottom: '-6px' },
  candHead: { marginTop: '16px', paddingBottom: '4px', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, borderBottom: `1px solid ${tokens.colorNeutralStroke1}` },
  candRow: { display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr)', columnGap: '8px', alignItems: 'center', width: '100%', padding: '6px 4px', border: 'none', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: 'transparent', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', ':hover': { backgroundColor: tokens.colorNeutralBackground2 } },
  candName: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  candMeta: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  hint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  applyBox: { display: 'grid', rowGap: '6px', marginTop: '14px', padding: '8px 10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
})

/**
 * シンプルな配信カード(SU1。docs/SIMPLE_CARD.md)。プレビューが主役で、部品を押すと、その部品だけを直すペインが出る。
 * 状態と保存は CardDetail のもの(editor)をそのまま使う。ここは並べ方と、部品の選び方・反映の時機だけを持つ
 */
interface Props {
  editor: SimpleEditor
  /** プレビューの枠(CardDetail の倍率の計算が測る箱) */
  boxRef: RefObject<HTMLDivElement | null>
  /** 別の部品を選んだときの反映(変わっていなければ何もしない。確定した週の配信は反映しない) */
  onCommit: () => Promise<void>
  /** 反映のボタン(確定した週の配信は、理由の入力欄を出す) */
  onApply: () => void
  onUndo: () => void
  onRunNext: (step: NextStep) => void
  onClose: () => void
}

export function SimpleCardLayout({ editor: e, boxRef, onCommit, onApply, onUndo, onRunNext, onClose }: Props) {
  const t = useT()
  const s = useStyles()
  const [part, setPart] = useState<PartRef | null>(null)
  // 商品の一覧で押した商品(選んでいる枠と見比べる)
  const [compareKey, setCompareKey] = useState<string | null>(null)
  const [widths, setWidths] = useState<[number, number]>(() => {
    const v = loadPref<[number, number] | null>(WIDTH_KEY, null)
    return Array.isArray(v) && v.length === 2 ? [clampW(Number(v[0])), clampW(Number(v[1]))] : [360, 300]
  })
  const [productsOpen, setProductsOpen] = useState(() => loadPref<boolean>(PRODUCTS_KEY, true))

  /** 部品を選ぶ。別の部品に移るときに、それまでの変更を反映(保存)する(SU1 ⑫) */
  const select = (p: PartRef | null) => {
    if (samePart(p, part)) return
    void onCommit()
    setPart(p)
    setCompareKey(null)
  }
  // 部品を選ぶ層には、変わらない関数を渡す(押すたびに、いまの値で select を呼ぶ)
  const selectRef = useRef(select)
  useEffect(() => {
    selectRef.current = select
  })
  const onPick = useCallback((p: PartRef | null) => selectRef.current(p), [])

  const resize = (i: 0 | 1) => (dx: number) => setWidths((w) => (i === 0 ? [clampW(w[0] - dx), w[1]] : [w[0], clampW(w[1] - dx)]))
  const saveWidths = () => savePref(WIDTH_KEY, widths)
  const toggleProducts = () => {
    setProductsOpen(!productsOpen)
    savePref(PRODUCTS_KEY, !productsOpen)
  }

  /**
   * 押した商品を、選んでいる枠に置く。選んでいるのは「枠」なので、置いたあとも同じ枠(いまはその商品)を選んだままにする。
   * 反映は、次に別の部品を選んだとき(ここで select を通すと、置く前の中身で保存してしまうため)
   */
  const placed = (target: PartRef, key: string) => {
    placeInPart(e, target, key)
    if (target.kind === 'product') setPart({ kind: 'product', itemKey: key })
    setCompareKey(null)
  }

  /** 商品の一覧の行を押したとき: 枠を選んでいれば見比べ、そうでなければ今と同じ商品のフロート */
  const openFromList = (key: string) => {
    const target = part && (part.kind === 'product' || part.kind === 'slot') && !(part.kind === 'product' && part.itemKey === key) ? part : null
    if (!target) {
      e.openProduct(key)
      return
    }
    setCompareKey(key)
    e.openProduct(key, {
      label: target.kind === 'product' ? t('この枠の商品と入れ替える', 'Swap with the product in this slot') : t('この枠に入れる', 'Put in this slot'),
      run: () => placed(target, key),
    })
  }

  const isOn = (p: PartRef) => samePart(p, part)
  const field = (p: PartRef, children: React.ReactNode, title?: string, className?: string) => (
    <button type="button" className={mergeClasses(s.topField, isOn(p) && s.on, className)} onClick={() => select(p)} title={title}>
      {children}
    </button>
  )
  const tpl = getTemplate(e.template)
  const country = optionLabel(countryOptions.find((o) => String(o.value) === e.form.country)?.label) ?? ''
  const target = targetText({ gender: e.form.targetGender, ages: e.form.targetAges, audience: '' })
  const chip = (key: string, label: string, value: string) =>
    field(
      { kind: 'overview', field: key },
      <span className={s.chip} style={{ display: 'inline-flex', columnGap: 4, minWidth: 0 }}>
        <span className={s.chipKey}>{label}</span>
        <span className={mergeClasses(s.chipVal, !value && s.empty)}>{value || t('未設定', 'Not set')}</span>
      </span>,
    )
  const when = e.form.scheduledAt ? new Date(e.form.scheduledAt).toLocaleString(locale(), { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : t('配信日時 未設定', 'No send date')

  return (
    <div className={s.root}>
      <div className={s.top}>
        {e.stageNav}
        <ChannelBadge channel={e.form.channel} />
        {field({ kind: 'meta', field: 'name' }, <span className={s.name}>{e.form.name || t('(配信名未入力)', '(No name)')}</span>, t('配信名を直す', 'Edit the name'), s.nameField)}
        {field({ kind: 'meta', field: 'scheduledAt' }, <span>{when}</span>, t('配信日時を直す', 'Edit the send date'))}
        {field(
          { kind: 'meta', field: 'status' },
          <>
            <span className={s.dot} style={{ backgroundColor: statusColor(e.form.status) }} />
            <span>{statusLabel(e.form.status)}</span>
          </>,
          t('ステータスを直す', 'Edit the status'),
        )}
        {e.abVariants && <Badge appearance="tint" color="brand">{t('AB テスト(A 案を表示)', 'A/B test (showing A)')}</Badge>}
        <span className={s.grow} />
        {/* 反映の様子: 保存中 / 保存しました / 未反映の変更あり */}
        {e.saving ? (
          <Spinner size="extra-tiny" label={t('反映しています', 'Saving')} labelPosition="after" />
        ) : e.justSaved ? (
          <span className={mergeClasses(s.state, s.saved)}>{t('反映しました', 'Saved')}</span>
        ) : null}
        <Tooltip content={t('前に反映した中身に戻します(開いている間の履歴)', 'Go back to the content before the last save (history while open)')} relationship="description">
          <Button type="button" size="small" appearance="subtle" icon={<ArrowUndoRegular />} disabled={!e.canUndo || e.saving} onClick={onUndo}>
            {t('元に戻す', 'Undo')}
          </Button>
        </Tooltip>
        {e.dirty && (
          <Tooltip content={e.locked ? t('確定した週の配信です。変えた理由を入力してから反映します', 'Confirmed week: enter a reason to save') : t('まだ反映していない変更があります。ほかの部品を押しても反映します', 'Unsaved changes. Picking another part also saves them')} relationship="description">
            <Button type="button" size="small" icon={<SaveRegular />} disabled={e.saving} onClick={onApply}>
              {t('反映', 'Save')}
            </Button>
          </Tooltip>
        )}
        <NextAction step={e.nextStep} busy={e.saving} onRun={onRunNext} />
        {e.menu}
        <Button type="button" appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label={t('閉じる', 'Close')} />
      </div>
      <div className={s.notices}>{e.notices}</div>
      <div className={s.overview}>
        <span className={s.overviewLabel}>{t('概要(メールには出ません)', 'Overview (not in the email)')}</span>
        {chip('theme', t('テーマ', 'Theme'), e.form.theme)}
        {chip('theme', t('切り口', 'Angle'), e.form.copyAngle)}
        {chip('instructions', t('制作指示', 'Notes'), e.form.instructions.split('\n')[0] ?? '')}
        {chip('country', t('国', 'Country'), country)}
        {chip('target', t('ターゲット', 'Target'), target ?? '')}
        {chip('owner', t('担当', 'Owner'), e.form.owner)}
        {chip('due', t('締め切り', 'Due'), e.form.productionDue ? new Date(`${e.form.productionDue}T00:00:00`).toLocaleDateString(locale(), { month: 'short', day: 'numeric' }) : '')}
      </div>

      <div className={s.panes} style={{ '--wp': `${widths[0]}px`, '--wl': `${productsOpen ? widths[1] : RAIL_W}px` } as React.CSSProperties}>
        {/* プレビュー(いちばん広い) */}
        <div className={s.previewPane}>
          <div className={s.toolbar}>
            {e.channel === 'email' && (
              <span role="tablist" aria-label={t('プレビューの幅', 'Preview width')} style={{ display: 'inline-flex', columnGap: 2 }}>
                {(['mobile', 'pc'] as const).map((d) => (
                  <Button key={d} type="button" size="small" role="tab" aria-selected={e.device === d} appearance={e.device === d ? 'primary' : 'subtle'} className={s.deviceBtn} icon={d === 'mobile' ? <PhoneRegular /> : <DesktopRegular />} onClick={() => e.setDevice(d)}>
                    {d === 'mobile' ? t('スマホ', 'Mobile') : t('PC', 'Desktop')}
                  </Button>
                ))}
              </span>
            )}
            {/* テンプレートの札(押すと、選んだ部品のペインにテンプレート。選び直しは段階 b) */}
            <Button type="button" size="small" appearance={isOn({ kind: 'template' }) ? 'primary' : 'outline'} icon={<LayoutColumnTwoRegular />} onClick={() => select({ kind: 'template' })}>
              {t(`テンプレート: ${tpl.label}`, `Template: ${tpl.label}`)}
            </Button>
            <span className={s.grow} />
            {e.zoomControls}
          </div>
          {e.channel === 'email' ? (
            <div className={s.inbox}>
              <span className={s.sender}>SHOP</span>
              <button type="button" className={mergeClasses(s.inboxPart, isOn({ kind: 'subject' }) && s.on)} style={{ fontWeight: 600 }} onClick={() => select({ kind: 'subject' })} title={t('件名を直す', 'Edit the subject')}>
                {e.form.subject || e.form.name || t('(件名未入力)', '(No subject)')}
              </button>
              <button type="button" className={mergeClasses(s.inboxPart, s.inboxSub, isOn({ kind: 'preheader' }) && s.on)} onClick={() => select({ kind: 'preheader' })} title={t('プリヘッダーを直す', 'Edit the preheader')}>
                {e.form.preheader || t('(プリヘッダー未入力)', '(No preheader)')}
              </button>
            </div>
          ) : (
            <span className={s.hint}>{t('通知のタイトル・本文・画像・商品は、プレビューを押して直します', 'Click the preview to edit the notification title, body, image and products')}</span>
          )}
          <div ref={boxRef} className={s.box} tabIndex={0} aria-label={t('プレビュー(押した部品を直します。Tab で次の部品、Esc で選ぶのをやめる)', 'Preview (click a part to edit it; Tab for the next part, Esc to stop)')}>
            {e.preview}
            <PreviewPartPicker boxRef={boxRef} selected={part && part.kind !== 'meta' && part.kind !== 'overview' ? part : null} onSelect={onPick} disabled={e.saving} />
          </div>
        </div>

        <Splitter onDrag={resize(0)} onDone={saveWidths} />

        {/* 選んだ部品のペイン */}
        <div className={s.pane} key={part ? partKey(part) : 'none'}>
          <PartPane editor={e} part={part} compareKey={compareKey} onPlace={(key) => part && placed(part, key)} onCompareDone={() => setCompareKey(null)} onPick={select} />
          {e.dirty && (
            <div className={s.applyBox}>
              <span className={s.hint}>
                {e.locked
                  ? t('確定した週の配信です。変えた理由を入力してから反映します。', 'This delivery is in a confirmed week. Enter a reason to save.')
                  : t('ほかの部品を押すと、自動で反映(保存)します。すぐに反映するときは、ここで。', 'Changes are saved when you pick another part. To save now, use this button.')}
              </span>
              <Button type="button" size="small" icon={<SaveRegular />} disabled={e.saving} onClick={onApply}>
                {e.locked ? t('理由を入力して反映', 'Save with a reason') : t('反映', 'Save')}
              </Button>
            </div>
          )}
          {e.footer}
        </div>

        <Splitter onDrag={productsOpen ? resize(1) : () => undefined} onDone={saveWidths} />

        {/* 商品の一覧(畳める)。畳んでいても、商品ごとの点とアラートの色を出す */}
        {productsOpen ? (
          <div className={s.pane}>
            <div className={s.listHead}>
              <Button type="button" size="small" appearance="subtle" icon={<ChevronRightRegular />} onClick={toggleProducts} aria-label={t('商品の一覧を畳む', 'Collapse the product list')} />
            </div>
            <ProductInfoPane
              template={e.template}
              sectionTitles={e.sectionTitles}
              items={e.items}
              products={e.products}
              onHover={e.hoverProduct}
              alertKinds={e.alertKinds}
              onOpenProduct={openFromList}
              hint={t('行を押すと詳細が開きます。プレビューで枠を選んでいれば、その枠の商品と見比べて入れ替えられます。', 'Click a row for details. If a slot is selected in the preview, you can compare and swap it in.')}
            />
            {e.candidates.length > 0 && (
              <>
                <div className={s.candHead}>{t(`候補(${e.candidates.length})`, `Candidates (${e.candidates.length})`)}</div>
                {e.candidates.map((c) => {
                  const p = e.products.find((x) => x.id === c.productId)
                  return p ? (
                    <button key={c.key} type="button" className={s.candRow} onClick={() => openFromList(c.key)} title={c.reason}>
                      <ImageThumb src={productImage(p)} alt={p.name} width={32} height={40} />
                      <span style={{ display: 'grid', minWidth: 0 }}>
                        <span className={s.candName}>{p.name}</span>
                        <span className={s.candMeta}>{`${p.product_code ?? ''} ・ ${t('在庫', 'Stock ')}${p.stock ?? '-'}`}</span>
                      </span>
                    </button>
                  ) : null
                })}
              </>
            )}
          </div>
        ) : (
          <div className={s.rail}>
            <Button type="button" size="small" appearance="subtle" icon={<ChevronLeftRegular />} onClick={toggleProducts} aria-label={t('商品の一覧を開く', 'Open the product list')} />
            {e.items.map((it) => {
              const kind = e.alertKinds.get(it.productId)
              const name = e.products.find((p) => p.id === it.productId)?.name ?? ''
              return (
                <Tooltip key={it.key} content={name} relationship="label">
                  <button type="button" className={s.railDot} style={{ backgroundColor: kind ? ALERT_COLOR[kind] : tokens.colorNeutralStroke1 }} onClick={() => select({ kind: 'product', itemKey: it.key })} />
                </Tooltip>
              )
            })}
            <span className={s.railLabel}>{t('商品の一覧', 'Products')}</span>
          </div>
        )}

        <span />

        {/* コミュニケーション(段階 d)。あとで足してもレイアウトが変わらないよう、場所だけ空けて畳んでおく */}
        <div className={s.rail} title={t('やり取り・承認・タスクは、次の段階でここに入ります(いまは「⋯」→「詳しい画面へ」)', 'Threads, approvals and tasks will come here in a later stage (for now: “⋯” → “Open full view”)')}>
          <span className={s.railLabel}>{t('コミュニケーション(準備中)', 'Communication (coming)')}</span>
        </div>
      </div>
    </div>
  )
}
