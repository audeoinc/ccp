import { useState } from 'react'
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Select,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import { AddRegular, ArrowDownRegular, ArrowUpRegular, CopyRegular, DeleteRegular, DismissRegular } from '@fluentui/react-icons'
import { AutoTextarea } from './AutoTextarea'
import { useT } from './i18n'
import { MAX_BUTTON_BLOCKS, MAX_BUTTON_LABEL, MAX_SECTIONS, MAX_SLOTS, deleteTemplate, fitSlots, saveTemplate } from './layoutTemplates'
import { TemplateThumb } from './TemplateThumb'
import {
  LINK_KINDS,
  MAX_BUTTONS_PER_BLOCK,
  buttonsAt,
  defaultButtonLabel,
  gridColumns,
  linkKindLabel,
  newButtonId,
  placedButtons,
  sectionKindLabel,
  setTemplateManagerOpen,
  slotStep,
  templateOptions,
  useTemplateManagerOpen,
  useTemplates,
  type ButtonBlock,
  type ButtonSpec,
  type HeroKind,
  type HeroText,
  type LinkKind,
  type Section,
  type TemplateLayout,
} from './templates'

/**
 * 編集中の構成は、上から順の部品(セクション・ボタン)の並びで持つ。
 * 保存するときに、セクションの並び(商品の枠の計算に使う)と、ボタンの置く位置(at)に分ける。
 * key は、並べ替えても入力欄の状態が入れ替わらないようにするための、画面だけの ID
 */
type Part = { key: string; type: 'section'; sec: Section } | { key: string; type: 'buttons'; buttons: ButtonSpec[] }

interface Draft extends Pick<TemplateLayout, 'hero' | 'heroText' | 'topBar' | 'heroLink'> {
  /** 保存済みの行の ID(新規は undefined) */
  id?: string
  name: string
  description: string
  parts: Part[]
}

let partSeq = 0
const partKey = () => `p${++partSeq}`

/**
 * テンプレートを、部品の並びに直す。以前の形のボタン(ヒーローのボタンの数、セクションの後のボタンの数)は、
 * ここで独立したボタンの部品に置き換える(保存すると、以後は部品として持つ)
 */
function toParts(layout: TemplateLayout): Part[] {
  const blocks = placedButtons(layout)
  const at = (i: number): Part[] => buttonsAt(blocks, i, layout.sections.length).map((buttons) => ({ key: partKey(), type: 'buttons', buttons: buttons.map((x) => ({ ...x })) }))
  return [...at(0), ...layout.sections.flatMap((sec, i): Part[] => [{ key: partKey(), type: 'section', sec: { ...sec, buttons: undefined } }, ...at(i + 1)])]
}

/** 部品の並びから、保存・見取り図に使う構成を作る */
function fromParts(d: Draft): TemplateLayout {
  const sections: Section[] = []
  const buttonBlocks: ButtonBlock[] = []
  for (const p of d.parts) {
    if (p.type === 'section') sections.push(p.sec)
    else if (p.buttons.length > 0) buttonBlocks.push({ at: sections.length, buttons: p.buttons })
  }
  return { hero: d.hero, heroText: d.heroText, topBar: d.topBar, heroLink: d.heroLink, sections, buttonBlocks }
}

/**
 * 種類の選択肢。データでは、種類(kind)と、列の数(columns)・左右(flip)の組み合わせで表す。
 * 選び直したときは、その種類で 1 行(1 組)になる枠の数に合わせる(3 列なら 3 点、モザイクなら 3 点)
 */
type SectionLayout = 'grid' | 'grid3' | 'photos' | 'photos3' | 'wide' | 'mosaic' | 'mosaicR' | 'story' | 'feature'
const LAYOUTS: SectionLayout[] = ['grid', 'grid3', 'photos', 'photos3', 'wide', 'mosaic', 'mosaicR', 'story', 'feature']
const layoutValue = (sec: Section): SectionLayout => {
  if (sec.kind === 'grid' || sec.kind === 'photos') return gridColumns(sec) === 3 ? `${sec.kind}3` : sec.kind
  if (sec.kind === 'mosaic') return sec.flip ? 'mosaicR' : 'mosaic'
  return sec.kind
}
const layoutSection = (v: SectionLayout): Section => {
  switch (v) {
    case 'grid3':
      return { kind: 'grid', columns: 3, slots: 3 }
    case 'photos3':
      return { kind: 'photos', columns: 3, slots: 6 }
    case 'mosaicR':
      return { kind: 'mosaic', flip: true, slots: 3 }
    default:
      return { kind: v, slots: v === 'mosaic' ? 3 : v === 'wide' ? 1 : 2 }
  }
}
const layoutPatch = (v: SectionLayout, sec: Section): Section => {
  const next = layoutSection(v)
  // 並び方だけを変える。見出し・コピーの設定は、そのまま残す
  return { ...next, categoryHeading: sec.categoryHeading, copy: sec.copy }
}

/** 構成のプレビューの幅。一覧の見取り図(84px)では、枠の数や列が読み取りにくいため、大きく描く */
const PREVIEW_WIDTH = 220

const newDraft = (): Draft => ({
  name: '',
  description: '',
  hero: 'standard',
  heroText: 'below',
  parts: [
    { key: partKey(), type: 'buttons', buttons: [{ id: newButtonId() }] },
    { key: partKey(), type: 'section', sec: { kind: 'grid', slots: 4 } },
  ],
})

const useStyles = makeStyles({
  surface: { width: '1360px', maxWidth: '96vw', height: '86vh', maxHeight: '86vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' },
  body: { display: 'flex', flexDirection: 'column', minHeight: 0, flexGrow: 1, padding: 0, rowGap: 0 },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px', padding: '12px 16px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  grow: { flexGrow: 1 },
  split: { flexGrow: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(360px, 520px) minmax(0, 1fr)' },
  // 一覧は 2 列。見比べやすいように、見取り図と説明を、同じ高さのカードに並べる
  list: {
    minHeight: 0,
    overflowY: 'auto',
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: '12px',
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '8px',
    alignContent: 'start',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  fullRow: { gridColumn: '1 / -1' },
  listHead: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap' },
  groupLabel: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, marginTop: '6px' },
  item: {
    display: 'flex',
    columnGap: '8px',
    padding: '8px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    minWidth: 0,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  itemSelected: { border: `1px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  itemText: { minWidth: 0, display: 'grid', rowGap: '2px', alignContent: 'start' },
  itemName: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase200, overflowWrap: 'anywhere' },
  // カードの高さをそろえるため、説明は 5 行で省略する(全文は、選ぶと右に出る)
  clamp: { display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  caption: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, lineHeight: '16px' },
  editor: { minHeight: 0, overflowY: 'auto', padding: '16px', display: 'grid', rowGap: '14px', alignContent: 'start', minWidth: 0 },
  // プレビューの欄は、見取り図の大きさ(枠線・余白を含む)に合わせる。固定の幅だと、見取り図の右端が欠ける
  editorGrid: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: '16px', alignItems: 'start' },
  fields: { display: 'grid', rowGap: '14px', minWidth: 0 },
  // 縦長の見取り図をスクロールしても、編集欄と並べて見られるように、上に貼り付ける
  preview: { display: 'grid', rowGap: '6px', justifyItems: 'start', position: 'sticky', top: 0 },
  // 縦長の見取り図は、それだけでスクロールできるようにする(長いテンプレートでも、編集しながら下まで見られる)
  previewScroll: { maxHeight: 'calc(86vh - 150px)', overflowY: 'auto', paddingRight: '4px' },
  row: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'end' },
  // 部品(ヒーロー・セクション・ボタン)のカード
  card: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, minWidth: 0 },
  cardButtons: { backgroundColor: tokens.colorNeutralBackground2 },
  cardHead: { display: 'flex', alignItems: 'center', columnGap: '6px', padding: '4px 6px 4px 10px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, minHeight: '32px' },
  cardTitle: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  // セクションの 4 つの設定を、1 行に並べる(狭いときは折り返す)
  sectionBody: { padding: '10px', display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.8fr)', gap: '10px 12px', alignItems: 'start' },
  // Select の既定の最小幅で、隣の欄に重ならないようにする
  fill: { width: '100%', minWidth: 0 },
  heroBody: { padding: '10px', display: 'flex', flexWrap: 'wrap', gap: '10px 16px', alignItems: 'start' },
  heroSelect: { width: '180px' },
  buttonRows: { padding: '10px', display: 'grid', rowGap: '8px' },
  buttonRow: { display: 'grid', gridTemplateColumns: '18px minmax(120px, 1fr) 96px minmax(130px, 160px) 28px', columnGap: '6px', alignItems: 'center' },
  partList: { display: 'grid', rowGap: '8px' },
  num: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  actions: { display: 'flex', alignItems: 'center', columnGap: '8px', padding: '10px 16px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
})

/** テンプレートの管理(一覧・新規・複製・編集・削除)。標準のテンプレートは編集できず、複製して編集する */
export function TemplateManager() {
  const open = useTemplateManagerOpen()
  useTemplates() // 登録が変わったら、一覧を描き直す
  const t = useT()
  const s = useStyles()
  const options = templateOptions()
  const [selectedId, setSelectedId] = useState<string>('standard4')
  const [draft, setDraft] = useState<Draft | null>(null) // 編集中(新規・複製・編集)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = options.find((o) => o.id === selectedId) ?? options[0]
  const editing = draft !== null

  const heroLabels: Record<HeroKind, string> = {
    standard: t('標準', 'Standard'),
    collab: t('コラボ', 'Collab'),
    offer: t('期間限定', 'Limited offer'),
  }
  const heroTextLabels: Record<HeroText, string> = {
    band: t('写真の下部に帯で重ねる', 'Band over the photo'),
    overlay: t('写真に大きく重ねる', 'Large over the photo'),
    below: t('写真の下に置く', 'Below the photo'),
  }
  const layoutLabel = (v: SectionLayout) => sectionKindLabel(layoutSection(v))
  const styleLabel = (b: ButtonSpec) => (b.style === 'outline' ? t('枠線', 'Outline') : t('塗り', 'Filled'))

  const close = () => {
    setTemplateManagerOpen(false)
    setDraft(null)
    setError(null)
  }

  const choose = (id: string) => {
    if (editing && !window.confirm(t('編集中の内容を破棄して、別のテンプレートを開きます。よろしいですか?', 'Discard the current edits and open another template?'))) return
    setDraft(null)
    setError(null)
    setSelectedId(id)
  }

  const startNew = () => {
    setError(null)
    setSelectedId('')
    setDraft(newDraft())
  }
  const startDuplicate = () => {
    if (!selected) return
    setError(null)
    setDraft({
      name: t(`${selected.label} のコピー`, `Copy of ${selected.label}`),
      description: selected.description,
      hero: selected.hero,
      heroText: selected.heroText,
      topBar: selected.topBar,
      heroLink: selected.heroLink,
      parts: toParts(selected),
    })
    setSelectedId('')
  }
  const startEdit = () => {
    if (!selected || selected.builtin) return
    setError(null)
    setDraft({ id: selected.id, name: selected.label, description: selected.description, hero: selected.hero, heroText: selected.heroText, topBar: selected.topBar, heroLink: selected.heroLink, parts: toParts(selected) })
  }

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d))
  const setParts = (fn: (parts: Part[]) => Part[]) => setDraft((d) => (d ? { ...d, parts: fn(d.parts) } : d))
  const patchSection = (key: string, p: Partial<Section>) => setParts((list) => list.map((x) => (x.key === key && x.type === 'section' ? { ...x, sec: { ...x.sec, ...p } } : x)))
  const setButtons = (key: string, fn: (buttons: ButtonSpec[]) => ButtonSpec[]) =>
    setParts((list) => list.map((x) => (x.key === key && x.type === 'buttons' ? { ...x, buttons: fn(x.buttons) } : x)))
  const patchButton = (key: string, id: string, p: Partial<ButtonSpec>) => setButtons(key, (list) => list.map((b) => (b.id === id ? { ...b, ...p } : b)))
  const movePart = (i: number, delta: number) =>
    setParts((list) => {
      const j = i + delta
      if (j < 0 || j >= list.length) return list
      const next = [...list]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  const removePart = (key: string) => setParts((list) => list.filter((x) => x.key !== key))

  const sectionCount = draft?.parts.filter((p) => p.type === 'section').length ?? 0
  const blockCount = draft?.parts.filter((p) => p.type === 'buttons').length ?? 0
  const totalSlots = (draft?.parts ?? []).reduce((n, p) => n + (p.type === 'section' ? p.sec.slots : 0), 0)
  const valid = !!draft && draft.name.trim() !== '' && sectionCount > 0

  const save = async () => {
    if (!draft || !valid) return
    setBusy(true)
    setError(null)
    try {
      const id = await saveTemplate({ id: draft.id, name: draft.name, description: draft.description, ...fromParts(draft) })
      setSelectedId(id)
      setDraft(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!selected || selected.builtin || editing) return
    if (!window.confirm(t(`「${selected.label}」を削除します。このテンプレートを使っている配信カードは、Standard4 として扱われます。よろしいですか?`, `Delete "${selected.label}"? Delivery cards that use it will be treated as Standard4.`))) return
    setBusy(true)
    setError(null)
    try {
      await deleteTemplate(selected.id)
      setSelectedId('standard4')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const customs = options.filter((o) => !o.builtin)
  const builtins = options.filter((o) => o.builtin)

  const renderItem = (o: (typeof options)[number]) => (
    <div key={o.id} className={mergeClasses(s.item, !editing && o.id === selected?.id && s.itemSelected)} onClick={() => choose(o.id)} role="button" tabIndex={0}>
      <TemplateThumb layout={o} free={o.id === 'free'} maxHeight={150} zoom />
      <div className={s.itemText}>
        <span className={s.itemName}>{o.label}</span>
        <span className={mergeClasses(s.caption, s.clamp)} title={o.description}>{o.description}</span>
      </div>
    </div>
  )

  /** 構成の要約(上から順に。ボタンも、置いた位置に並べる) */
  const summary = (layout: TemplateLayout) =>
    toParts(layout)
      .map((p) =>
        p.type === 'section'
          ? `${sectionKindLabel(p.sec)}${t(` ${p.sec.slots}点`, ` ×${p.sec.slots}`)}${p.sec.categoryHeading ? t('(見出し付き)', ' (heading)') : ''}${p.sec.copy === false ? t('(コピーなし)', ' (no copy)') : ''}`
          : t(`ボタン ${p.buttons.length}`, `${p.buttons.length} button(s)`),
      )
      .join(' → ')

  // ---- 部品のカード
  const partActions = (i: number, p: Part) => (
    <>
      <Button size="small" appearance="subtle" icon={<ArrowUpRegular />} disabled={i === 0} onClick={() => movePart(i, -1)} aria-label={t('上へ', 'Move up')} />
      <Button size="small" appearance="subtle" icon={<ArrowDownRegular />} disabled={i === (draft?.parts.length ?? 0) - 1} onClick={() => movePart(i, 1)} aria-label={t('下へ', 'Move down')} />
      <Button
        size="small"
        appearance="subtle"
        icon={<DeleteRegular />}
        disabled={p.type === 'section' && sectionCount <= 1}
        onClick={() => removePart(p.key)}
        aria-label={p.type === 'section' ? t('このセクションを削除', 'Remove this section') : t('このボタンの部品を削除', 'Remove these buttons')}
      />
    </>
  )

  const sectionCard = (p: Extract<Part, { type: 'section' }>, i: number, no: number) => {
    const sec = p.sec
    return (
      <div key={p.key} className={s.card}>
        <div className={s.cardHead}>
          <Badge size="small" appearance="tint" color="brand">{t(`セクション ${no}`, `Section ${no}`)}</Badge>
          <span className={s.caption}>{`${sectionKindLabel(sec)} · ${t(`${sec.slots} 点`, `${sec.slots} items`)}`}</span>
          <span className={s.grow} />
          {partActions(i, p)}
        </div>
        <div className={s.sectionBody}>
          <Field label={t('商品の並び方', 'Product layout')}>
            <Select size="small" className={s.fill} value={layoutValue(sec)} onChange={(_, d) => patchSection(p.key, layoutPatch(d.value as SectionLayout, sec))}>
              {LAYOUTS.map((v) => (
                <option key={v} value={v}>{layoutLabel(v)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('商品の枠の数', 'Product slots')}>
            <Select size="small" className={s.fill} value={String(sec.slots)} onChange={(_, d) => patchSection(p.key, { slots: fitSlots(sec.kind, Number(d.value)) })}>
              {Array.from({ length: Math.floor(MAX_SLOTS / slotStep(sec.kind)) }, (_, k) => (k + 1) * slotStep(sec.kind)).map((n) => (
                <option key={n} value={n}>{t(`${n} 点`, `${n} items`)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('見出し', 'Heading')}>
            <Checkbox label={t('AI で付ける', 'Add (AI)')} checked={!!sec.categoryHeading} onChange={(_, d) => patchSection(p.key, { categoryHeading: d.checked === true })} />
          </Field>
          <Field label={t('コピー', 'Copy')}>
            <Checkbox label={t('置く', 'Show')} checked={sec.copy !== false} onChange={(_, d) => patchSection(p.key, { copy: d.checked === true ? undefined : false })} />
          </Field>
        </div>
      </div>
    )
  }

  const buttonsCard = (p: Extract<Part, { type: 'buttons' }>, i: number) => (
    <div key={p.key} className={mergeClasses(s.card, s.cardButtons)}>
      <div className={s.cardHead}>
        <Badge size="small" appearance="tint" color="informative">{t('ボタン', 'Buttons')}</Badge>
        <span className={s.caption}>{p.buttons.map((b, k) => t(`${b.label?.trim() || defaultButtonLabel(k)}(${styleLabel(b)})`, `${b.label?.trim() || defaultButtonLabel(k)} (${styleLabel(b)})`)).join(t('、', ', '))}</span>
        <span className={s.grow} />
        {partActions(i, p)}
      </div>
      <div className={s.buttonRows}>
        <div className={s.buttonRow}>
          <span />
          <span className={s.caption}>{t('文言', 'Label')}</span>
          <span className={s.caption}>{t('見た目', 'Style')}</span>
          <span className={s.caption}>{t('リンク先(既定)', 'Link (default)')}</span>
          <span />
        </div>
        {p.buttons.map((b, k) => (
          <div key={b.id} className={s.buttonRow}>
            <span className={s.num}>{k + 1}</span>
            <Input
              size="small"
              value={b.label ?? ''}
              placeholder={defaultButtonLabel(k)}
              maxLength={MAX_BUTTON_LABEL}
              aria-label={t(`ボタン ${k + 1} の文言`, `Button ${k + 1} label`)}
              onChange={(_, d) => patchButton(p.key, b.id, { label: d.value })}
            />
            <Select size="small" value={b.style ?? 'fill'} aria-label={t('見た目', 'Style')} onChange={(_, d) => patchButton(p.key, b.id, { style: d.value === 'outline' ? 'outline' : undefined })}>
              <option value="fill">{t('塗り', 'Filled')}</option>
              <option value="outline">{t('枠線', 'Outline')}</option>
            </Select>
            <Select size="small" value={b.link ?? 'campaign'} aria-label={t('リンク先', 'Link')} onChange={(_, d) => patchButton(p.key, b.id, { link: d.value as LinkKind })}>
              {LINK_KINDS.map((k2) => (
                <option key={k2} value={k2}>{linkKindLabel(k2)}</option>
              ))}
            </Select>
            <Button
              size="small"
              appearance="subtle"
              icon={<DismissRegular />}
              disabled={p.buttons.length <= 1}
              onClick={() => setButtons(p.key, (list) => list.filter((x) => x.id !== b.id))}
              aria-label={t('このボタンを外す', 'Remove this button')}
            />
          </div>
        ))}
        {p.buttons.length < MAX_BUTTONS_PER_BLOCK && (
          <div>
            <Button size="small" appearance="subtle" icon={<AddRegular />} onClick={() => setButtons(p.key, (list) => [...list, { id: newButtonId(), style: 'outline' }])}>
              {t('横にボタンを追加', 'Add a button beside')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface className={s.surface}>
        <DialogBody className={s.body}>
          <div className={s.head}>
            <DialogTitle className={s.grow}>{t('テンプレート', 'Templates')}</DialogTitle>
            <Button appearance="subtle" icon={<DismissRegular />} onClick={close} aria-label={t('閉じる', 'Close')} />
          </div>
          <DialogContent className={s.split} style={{ padding: 0 }}>
            <div className={s.list}>
              <div className={mergeClasses(s.listHead, s.fullRow)}>
                <Button size="small" appearance="primary" icon={<AddRegular />} onClick={startNew}>{t('新規作成', 'New')}</Button>
                <Button size="small" appearance="outline" icon={<CopyRegular />} onClick={startDuplicate} disabled={!selected || (editing && !draft?.id && selectedId === '')}>{t('複製', 'Duplicate')}</Button>
              </div>
              <span className={mergeClasses(s.groupLabel, s.fullRow)}>{t('作成したテンプレート', 'Your templates')}</span>
              {customs.length === 0 && <span className={mergeClasses(s.caption, s.fullRow)}>{t('まだありません。「新規作成」か、標準のテンプレートの「複製」から作れます。', 'None yet. Create one with "New", or duplicate a standard template.')}</span>}
              {customs.map(renderItem)}
              <span className={mergeClasses(s.groupLabel, s.fullRow)}>{t('標準', 'Standard')}</span>
              {builtins.map(renderItem)}
            </div>

            <div className={s.editor}>
              {error && (
                <MessageBar layout="multiline" intent="error">
                  <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
              )}

              {draft ? (
                <div className={s.editorGrid}>
                  <div className={s.fields}>
                    <Field label={t('テンプレート名', 'Template name')} required>
                      <Input size="small" value={draft.name} onChange={(_, d) => patch({ name: d.value })} />
                    </Field>
                    <Field label={t('説明', 'Description')}>
                      <AutoTextarea rows={2} size="small" value={draft.description} onChange={(_, d) => patch({ description: d.value })} />
                    </Field>

                    <div className={s.card}>
                      <div className={s.cardHead}>
                        <span className={s.cardTitle}>{t('ヒーロー(メイン画像)', 'Hero (main image)')}</span>
                      </div>
                      <div className={s.heroBody}>
                        <Field label={t('種類', 'Type')}>
                          <div className={s.row} style={{ flexWrap: 'nowrap' }}>
                            {(['standard', 'collab', 'offer'] as HeroKind[]).map((h) => (
                              <Button key={h} size="small" appearance={draft.hero === h ? 'primary' : 'outline'} aria-pressed={draft.hero === h} onClick={() => patch({ hero: h })}>
                                {heroLabels[h]}
                              </Button>
                            ))}
                          </div>
                        </Field>
                        <Field label={t('ヘッドラインの見せ方', 'Headline placement')}>
                          <Select size="small" className={s.heroSelect} value={draft.heroText ?? 'band'} onChange={(_, d) => patch({ heroText: d.value as HeroText })}>
                            {(['below', 'overlay', 'band'] as HeroText[]).map((h) => (
                              <option key={h} value={h}>{heroTextLabels[h]}</option>
                            ))}
                          </Select>
                        </Field>
                        <Field label={t('画像のリンク先(既定)', 'Image link (default)')}>
                          <Select size="small" className={s.heroSelect} value={draft.heroLink ?? 'campaign'} onChange={(_, d) => patch({ heroLink: d.value === 'campaign' ? undefined : (d.value as LinkKind) })}>
                            {LINK_KINDS.map((k) => (
                              <option key={k} value={k}>{linkKindLabel(k)}</option>
                            ))}
                          </Select>
                        </Field>
                        <Field label={t('お知らせ帯', 'Top bar')}>
                          <Checkbox label={t('メールの最上部に置く', 'Show at the very top')} checked={!!draft.topBar} onChange={(_, d) => patch({ topBar: d.checked === true || undefined })} />
                        </Field>
                      </div>
                    </div>

                    <Field
                      label={t(`構成(上から順に。商品の枠は合計 ${totalSlots} 点)`, `Layout (top to bottom; ${totalSlots} product slots in total)`)}
                      hint={t('ボタンは、セクションとは別の部品です。上下の矢印で、好きな位置に置けます。リンク先は既定の種類で、実際の URL は配信ごとに決めます。', 'Buttons are separate parts; move them anywhere with the arrows. Links are default kinds; the actual URLs are set per delivery.')}
                    >
                      <div className={s.partList}>
                        {(() => {
                          let no = 0
                          return draft.parts.map((p, i) => (p.type === 'section' ? sectionCard(p, i, ++no) : buttonsCard(p, i)))
                        })()}
                        <div className={s.row}>
                          <Button
                            size="small"
                            appearance="outline"
                            icon={<AddRegular />}
                            disabled={sectionCount >= MAX_SECTIONS}
                            onClick={() => setParts((list) => [...list, { key: partKey(), type: 'section', sec: { kind: 'grid', slots: 2 } }])}
                          >
                            {t('セクションを追加', 'Add a section')}
                          </Button>
                          <Button
                            size="small"
                            appearance="outline"
                            icon={<AddRegular />}
                            disabled={blockCount >= MAX_BUTTON_BLOCKS}
                            onClick={() => setParts((list) => [...list, { key: partKey(), type: 'buttons', buttons: [{ id: newButtonId(), style: 'outline' }] }])}
                          >
                            {t('ボタンを追加', 'Add buttons')}
                          </Button>
                        </div>
                      </div>
                    </Field>
                  </div>
                  <div className={s.preview}>
                    <Text size={200} weight="semibold">{t('構成のプレビュー', 'Layout preview')}</Text>
                    <div className={s.previewScroll}>
                      <TemplateThumb layout={fromParts(draft)} width={PREVIEW_WIDTH} />
                    </div>
                  </div>
                </div>
              ) : selected ? (
                <div className={s.editorGrid}>
                  <div className={s.fields}>
                    <div style={{ display: 'flex', alignItems: 'center', columnGap: 8, flexWrap: 'wrap' }}>
                      <Text weight="semibold" size={400}>{selected.label}</Text>
                      <Badge size="small" appearance="tint" color={selected.builtin ? 'informative' : 'brand'}>{selected.builtin ? t('標準', 'Standard') : t('作成したテンプレート', 'Your template')}</Badge>
                    </div>
                    <span className={s.caption}>{selected.description || t('(説明なし)', '(No description)')}</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 12, rowGap: 4 }}>
                      <span className={s.caption}>{t('ヒーロー', 'Hero')}</span>
                      <span style={{ fontSize: tokens.fontSizeBase200 }}>
                        {[heroLabels[selected.hero], heroTextLabels[selected.heroText ?? 'band'], selected.topBar ? t('お知らせ帯あり', 'top bar') : '']
                          .filter(Boolean)
                          .join(t('、', ', '))}
                      </span>
                      <span className={s.caption}>{t('構成', 'Layout')}</span>
                      <span style={{ fontSize: tokens.fontSizeBase200 }}>
                        {selected.id === 'free' ? t('自由な並び(枠の数は決まっていません)', 'Free-form (no fixed number of slots)') : summary(selected)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {selected.builtin ? (
                        <Button size="small" appearance="primary" icon={<CopyRegular />} onClick={startDuplicate}>{t('複製して編集', 'Duplicate to edit')}</Button>
                      ) : (
                        <>
                          <Button size="small" appearance="primary" onClick={startEdit}>{t('編集', 'Edit')}</Button>
                          <Button size="small" appearance="outline" icon={<DeleteRegular />} onClick={remove} disabled={busy}>{t('削除', 'Delete')}</Button>
                        </>
                      )}
                    </div>
                    {selected.builtin && <span className={s.caption}>{t('標準のテンプレートは、編集・削除できません。複製して、自分用に作り変えてください。', 'Standard templates cannot be edited or deleted. Duplicate one to make your own version.')}</span>}
                  </div>
                  <div className={s.preview}>
                    <Text size={200} weight="semibold">{t('構成のプレビュー', 'Layout preview')}</Text>
                    <div className={s.previewScroll}>
                      <TemplateThumb layout={selected} free={selected.id === 'free'} width={PREVIEW_WIDTH} />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </DialogContent>
          {draft && (
            <div className={s.actions}>
              <span className={s.grow} />
              <Button appearance="secondary" onClick={() => { setDraft(null); setError(null) }} disabled={busy}>{t('キャンセル', 'Cancel')}</Button>
              <Button appearance="primary" onClick={() => void save()} disabled={!valid || busy}>{busy ? t('保存中...', 'Saving...') : t('保存', 'Save')}</Button>
            </div>
          )}
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
