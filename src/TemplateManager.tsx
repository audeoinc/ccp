import { useMemo, useState } from 'react'
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
  Tab,
  TabList,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import { AddRegular, ArrowDownRegular, ArrowResetRegular, ArrowUpRegular, CopyRegular, DeleteRegular, DismissRegular, EditRegular, EyeOffRegular, EyeRegular, MailRegular, PhoneRegular } from '@fluentui/react-icons'
import { AutoTextarea } from './AutoTextarea'
import { locale, useT } from './i18n'
import { MAX_BUTTON_BLOCKS, MAX_BUTTON_LABEL, MAX_SECTIONS, MAX_SLOTS, deleteTemplate, fitSlots, resetBuiltin, restoreVersion, saveTemplate, setTemplateHidden } from './layoutTemplates'
import type { DeliveryCard } from './models/deliveryCards'
import { statusLabel, statusRank } from './status'
import { TemplateThumb } from './TemplateThumb'
import { PushThumb } from './PushThumb'
import {
  DEFAULT_PUSH_TEMPLATE,
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
  templateIdOfCard,
  templateOptions,
  useTemplateManagerOpen,
  useTemplates,
  currentVersion,
  getTemplate,
  pastVersions,
  templateKey,
  builtinOriginal,
  type ButtonBlock,
  type ButtonSpec,
  type HeroKind,
  type HeroText,
  type TemplateChannel,
  type PushSpec,
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
  /** アプリのテンプレート: 通知の形(メールのテンプレートでは undefined) */
  push?: PushSpec
  /** 変更のメモ(版の履歴に残す) */
  note?: string
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
  surface: { width: '1360px', maxWidth: 'calc(96vw / var(--ui-zoom, 1))', height: 'calc(86vh / var(--ui-zoom, 1))', maxHeight: 'calc(86vh / var(--ui-zoom, 1))', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' },
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
  // 使わないテンプレートの開け閉め。一覧は高さの決まったスクロールの格子で、ボタンは overflow: hidden なので、
  // 高さを決めておかないと、行がつぶれる(2026-10-21 利用者の指摘)
  inactiveToggle: { minHeight: '32px', justifyContent: 'flex-start', marginTop: '6px' },
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
  itemTags: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap' },
  // 版の履歴・使っている配信
  history: { display: 'grid', rowGap: '4px', paddingTop: '8px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  historyHead: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold },
  historyRow: { display: 'flex', alignItems: 'center', columnGap: '8px', padding: '2px 6px', borderRadius: tokens.borderRadiusMedium, minWidth: 0 },
  historyOn: { backgroundColor: tokens.colorBrandBackground2 },
  historyVer: { fontSize: '12px', fontWeight: tokens.fontWeightSemibold, minWidth: '40px' },
  usedGroup: { display: 'grid', rowGap: '2px' },
  usedRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    columnGap: '10px',
    alignItems: 'center',
    textAlign: 'left',
    padding: '4px 6px',
    border: 'none',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  usedName: { fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
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
  previewScroll: { maxHeight: 'calc((86vh / var(--ui-zoom, 1)) - 150px)', overflowY: 'auto', paddingRight: '4px' },
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

/**
 * テンプレートの管理(一覧・新規・複製・編集・版の履歴・使っている配信・使わない(無効)・削除)。
 * テンプレートは版で持つ(配信のもとになるマスターなので): 保存するたびに新しい版になり、配信カードは、テンプレートの ID と使った版の番号を持つ。
 * 編集しても、すでにある配信は使った版の形のまま(見た目・見出し・商品の位置は変わらない)。前の版に戻すときも、新しい版として上に積む。
 * 標準も編集できる(コードの定義が版 0。上書きの行で置き換える)。使っているテンプレートは削除せず、使わない(無効)にする
 */
export function TemplateManager({ cards, onChanged, onOpenCard }: { cards: DeliveryCard[]; onChanged: () => Promise<void>; onOpenCard: (id: string) => void }) {
  const open = useTemplateManagerOpen()
  useTemplates() // 登録が変わったら、一覧を描き直す
  const t = useT()
  const s = useStyles()
  // メール用 / アプリ用を、タブで分ける(配信カードは、チャネルごとに、そのチャネルのテンプレートだけを選ぶ)
  const [channel, setChannel] = useState<TemplateChannel>('email')
  // 使わない(無効)のものも出す(一覧の下にたたむ)。過去の版は出さない(詳しい欄の、版の履歴に出す)
  const options = templateOptions(channel, true)
  const [showHidden, setShowHidden] = useState(false)
  // テンプレートごとの、使っている配信の数(状態ごと・版ごと)。編集・使わない・削除のときに知らせる
  const usage = useMemo(() => {
    // テンプレートの ID でまとめる(どの版を使っていても、同じテンプレートとして数える)
    const m = new Map<string, { total: number; fixed: number; reviewing: number; draft: number; byVersion: Map<number, DeliveryCard[]> }>()
    for (const c of cards) {
      const id = templateIdOfCard(c)
      const u = m.get(id) ?? { total: 0, fixed: 0, reviewing: 0, draft: 0, byVersion: new Map<number, DeliveryCard[]>() }
      u.total += 1
      const v = c.layout_version ?? currentVersion(id)
      u.byVersion.set(v, [...(u.byVersion.get(v) ?? []), c])
      const r = statusRank(c.status)
      if (r >= statusRank('approved')) u.fixed += 1
      else if (r >= statusRank('reviewing')) u.reviewing += 1
      else u.draft += 1
      m.set(id, u)
    }
    return m
  }, [cards])
  const usageOf = (id?: string) => (id ? usage.get(id) : undefined) ?? { total: 0, fixed: 0, reviewing: 0, draft: 0, byVersion: new Map<number, DeliveryCard[]>() }
  const usageText = (id?: string) => {
    const u = usageOf(id)
    return t(
      `${u.total} 本の配信で使っています(承認済み・確定 ${u.fixed} 本、承認待ち ${u.reviewing} 本、未起案 ${u.draft} 本)`,
      `Used by ${u.total} deliveries (approved/confirmed ${u.fixed}, awaiting approval ${u.reviewing}, not started ${u.draft})`,
    )
  }
  const [selectedId, setSelectedId] = useState<string>('standard4')
  // 詳しい欄で見ている過去の版の鍵(null は、いまの版)
  const [viewKey, setViewKey] = useState<string | null>(null)
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
    setViewKey(null)
    if (editing && !window.confirm(t('編集中の内容を破棄して、別のテンプレートを開きます。よろしいですか?', 'Discard the current edits and open another template?'))) return
    setDraft(null)
    setError(null)
    setSelectedId(id)
  }

  const startNew = () => {
    setError(null)
    setSelectedId('')
    setDraft(channel === 'push' ? { ...newDraft(), push: { image: true, buttons: [] } } : newDraft())
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
      push: selected.push ? { ...selected.push, buttons: [...selected.push.buttons] } : undefined,
    })
    setSelectedId('')
  }
  // 自由な並び(free)は、決まった構成がないので、編集するものがない
  const canEdit = (o?: { id: string }) => !!o && o.id !== 'free'
  const startEdit = () => {
    if (!selected || !canEdit(selected)) return
    setError(null)
    setDraft({ id: selected.id, name: selected.label, description: selected.description, hero: selected.hero, heroText: selected.heroText, topBar: selected.topBar, heroLink: selected.heroLink, parts: toParts(selected), push: selected.push })
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
  const valid = !!draft && draft.name.trim() !== '' && (sectionCount > 0 || !!draft.push)

  /** 操作をまとめて行う(失敗したら知らせる。配信を付け替えたら、配信を読み直す) */
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!draft || !valid) return
    const used = draft.id ? usageOf(draft.id).total : 0
    const next = draft.id ? currentVersion(draft.id) + 1 : 1
    // 使っている配信があるときは、保存しても、その配信は使った版の形のままであることを知らせて、確かめる
    if (
      used > 0 &&
      !window.confirm(
        t(
          `${usageText(draft.id)}。\n\n保存すると、版 ${next} になります。これらの配信は、使った版の形のままです(見た目・見出し・商品の位置は変わりません)。これから作る配信と、テンプレートを選び直した配信から、版 ${next} になります。\n\n保存しますか?`,
          `${usageText(draft.id)}.\n\nSaving creates v${next}. These deliveries keep the version they used (look, headings and product positions stay). New deliveries, and ones that re-select this template, get v${next}.\n\nSave?`,
        ),
      )
    )
      return
    await run(async () => {
      const id = await saveTemplate({ id: draft.id, name: draft.name, description: draft.description, ...fromParts(draft), push: draft.push }, cards, draft.note ?? '')
      if (used > 0) await onChanged()
      setSelectedId(id)
      setDraft(null)
    })
  }

  /** 作成したテンプレートで、どの版もどの配信でも使っていないものだけ、削除できる(版の履歴も消す) */
  const remove = async () => {
    if (!selected || selected.builtin || editing || usageOf(selected.id).total > 0) return
    if (!window.confirm(t(`「${selected.label}」を削除します。どの版も、どの配信でも使っていません。版の履歴も消えます。よろしいですか?`, `Delete "${selected.label}"? No delivery uses any version of it. Its version history is deleted too.`))) return
    await run(async () => {
      await deleteTemplate(selected.id)
      setSelectedId(channel === 'push' ? DEFAULT_PUSH_TEMPLATE : 'standard4')
    })
  }

  /** 使わない(無効)にする・また使う(配信カードの選択肢から外すだけ。使っている配信は、そのまま) */
  const toggleHidden = async (hide: boolean) => {
    if (!selected || editing) return
    if (hide && !window.confirm(t(`「${selected.label}」を使わない(無効)にします。配信カードのテンプレートの選択肢に出なくなります。使っている配信は、そのままです。あとで「また使う」で戻せます。よろしいですか?`, `Make "${selected.label}" inactive? It will no longer be offered in delivery cards. Deliveries that use it stay as they are. You can reactivate it later.`))) return
    await run(() => setTemplateHidden(selected.id, hide))
  }

  /** 標準を最初の形に戻す(最初の形を、新しい版として保存する。使っている配信は、使った版のまま) */
  const reset = async () => {
    if (!selected?.edited || editing) return
    const used = usageOf(selected.id).total
    if (!window.confirm(t(`「${selected.label}」を、最初の形に戻します(版 ${currentVersion(selected.id) + 1} として保存)。${used > 0 ? `${usageText(selected.id)}。これらの配信は、使った版の形のままです。` : ''}よろしいですか?`, `Reset "${selected.label}" to the original (saved as v${currentVersion(selected.id) + 1})? ${used > 0 ? `${usageText(selected.id)}. They keep the version they used. ` : ''}Continue?`))) return
    await run(async () => {
      await resetBuiltin(selected.id, cards)
      if (used > 0) await onChanged()
    })
  }

  /** 前の版に戻す(その版の中身を、新しい版として保存する。履歴は消さない) */
  const restore = async (key: string, v: number) => {
    if (!selected || editing) return
    const used = usageOf(selected.id).total
    if (!window.confirm(t(`版 ${v} の形に戻します(版 ${currentVersion(selected.id) + 1} として保存)。${used > 0 ? `${usageText(selected.id)}。これらの配信は、使った版の形のままです。` : ''}よろしいですか?`, `Restore v${v} (saved as v${currentVersion(selected.id) + 1})? ${used > 0 ? `${usageText(selected.id)}. They keep the version they used. ` : ''}Continue?`))) return
    await run(async () => {
      await restoreVersion(selected.id, key, cards)
      if (used > 0) await onChanged()
      setViewKey(null)
    })
  }

  const dateText = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(locale(), { year: 'numeric', month: 'numeric', day: 'numeric' }) : '')
  /** 版の履歴(新しい順)。版ごとに、保存した日・人・メモ・使っている配信の数。過去の版は「見る」「この版に戻す」 */
  const versionHistory = (id: string) => {
    const cur = currentVersion(id)
    const u = usageOf(id)
    const rows = [
      ...pastVersions(id).filter((v) => (v.version ?? 0) !== cur),
      // 標準の版 0(コードの定義)は、版の表にないので足す
      ...(builtinOriginal(id) && cur !== 0 && !pastVersions(id).some((v) => v.version === 0) ? [{ ...builtinOriginal(id)!, version: 0, note: t('最初の形(コードの定義)', 'Original (built-in)') }] : []),
    ].sort((a, b) => (b.version ?? 0) - (a.version ?? 0))
    const curRow = pastVersions(id).find((v) => v.version === cur)
    return (
      <div className={s.history}>
        <span className={s.historyHead}>{t('版の履歴', 'Version history')}</span>
        <div className={s.historyRow}>
          <span className={s.historyVer}>{t(`版 ${cur}`, `v${cur}`)}</span>
          <Badge size="small" appearance="tint" color="brand">{t('いまの版', 'Latest')}</Badge>
          <span className={s.caption}>{[dateText(curRow?.savedAt), curRow?.author, curRow?.note].filter(Boolean).join(' ・ ')}</span>
          <span className={s.grow} />
          <span className={s.caption}>{t(`${u.byVersion.get(cur)?.length ?? 0} 本`, `${u.byVersion.get(cur)?.length ?? 0} uses`)}</span>
          {viewKey && (
            <Button size="small" appearance="subtle" onClick={() => setViewKey(null)}>
              {t('見る', 'View')}
            </Button>
          )}
        </div>
        {rows.length === 0 && <span className={s.caption}>{t('過去の版はありません。', 'No earlier versions.')}</span>}
        {rows.map((v) => {
          const key = templateKey(id, v.version)
          return (
            <div key={key} className={mergeClasses(s.historyRow, viewKey === key && s.historyOn)}>
              <span className={s.historyVer}>{t(`版 ${v.version}`, `v${v.version}`)}</span>
              <span className={s.caption}>{[dateText(v.savedAt), v.author, v.note].filter(Boolean).join(' ・ ')}</span>
              <span className={s.grow} />
              <span className={s.caption}>{t(`${u.byVersion.get(v.version ?? 0)?.length ?? 0} 本`, `${u.byVersion.get(v.version ?? 0)?.length ?? 0} uses`)}</span>
              <Button size="small" appearance="subtle" onClick={() => setViewKey(viewKey === key ? null : key)}>
                {viewKey === key ? t('閉じる', 'Close') : t('見る', 'View')}
              </Button>
              <Button size="small" appearance="subtle" icon={<ArrowResetRegular />} disabled={busy || editing} onClick={() => void restore(key, v.version ?? 0)}>
                {t('この版に戻す', 'Restore')}
              </Button>
            </div>
          )
        })}
      </div>
    )
  }
  /** 使っている配信(版ごと)。押すと配信カードを開く */
  const usedBy = (id: string) => {
    const u = usageOf(id)
    if (u.total === 0) return null
    const versions = [...u.byVersion.keys()].sort((a, b) => b - a)
    return (
      <div className={s.history}>
        <span className={s.historyHead}>{t(`使っている配信(${u.total} 本)`, `Deliveries using it (${u.total})`)}</span>
        {versions.map((v) => (
          <div key={v} className={s.usedGroup}>
            <span className={s.caption}>{v === currentVersion(id) ? t(`版 ${v}(いまの版)`, `v${v} (latest)`) : t(`版 ${v}`, `v${v}`)}</span>
            {[...(u.byVersion.get(v) ?? [])]
              .sort((a, b) => (b.scheduled_at ?? '').localeCompare(a.scheduled_at ?? ''))
              .map((c) => (
                <button key={c.id} type="button" className={s.usedRow} onClick={() => onOpenCard(c.id)}>
                  <span className={s.usedName}>{c.name}</span>
                  <span className={s.caption}>{dateText(c.scheduled_at)}</span>
                  <span className={s.caption}>{statusLabel(c.status)}</span>
                </button>
              ))}
          </div>
        ))}
      </div>
    )
  }

  const customs = options.filter((o) => !o.builtin && !o.hidden)
  const builtins = options.filter((o) => o.builtin && !o.hidden)
  const hiddenList = options.filter((o) => o.hidden)

  const renderItem = (o: (typeof options)[number]) => (
    <div key={o.id} className={mergeClasses(s.item, !editing && o.id === selected?.id && s.itemSelected)} onClick={() => choose(o.id)} role="button" tabIndex={0}>
      {o.push ? <PushThumb spec={o.push} width={96} /> : <TemplateThumb layout={o} free={o.id === 'free'} maxHeight={150} zoom />}
      <div className={s.itemText}>
        <span className={s.itemName}>{o.label}</span>
        <span className={mergeClasses(s.caption, s.clamp)} title={o.description}>{o.description}</span>
        <span className={s.itemTags}>
          {o.edited && (
            <Badge size="small" appearance="tint" color="brand">
              {t('編集済み', 'Edited')}
            </Badge>
          )}
          {o.hidden && (
            <Badge size="small" appearance="outline" color="subtle">
              {t('使わない', 'Inactive')}
            </Badge>
          )}
          <span className={s.caption}>{usageOf(o.id).total > 0 ? t(`${usageOf(o.id).total} 本で使用`, `Used by ${usageOf(o.id).total}`) : t('未使用', 'Not used')}</span>
        </span>
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
              <TabList
                size="small"
                className={s.fullRow}
                selectedValue={channel}
                onTabSelect={(_, d) => {
                  if (editing && !window.confirm(t('編集中の内容を破棄します。よろしいですか?', 'Discard the current edits?'))) return
                  const next = d.value as TemplateChannel
                  setDraft(null)
                  setChannel(next)
                  setSelectedId(next === 'push' ? DEFAULT_PUSH_TEMPLATE : 'standard4')
                }}
              >
                <Tab value="email" icon={<MailRegular />}>{t('メール', 'Email')}</Tab>
                <Tab value="push" icon={<PhoneRegular />}>{t('アプリ', 'App')}</Tab>
              </TabList>
              <div className={mergeClasses(s.listHead, s.fullRow)}>
                <Button size="small" appearance="primary" icon={<AddRegular />} onClick={startNew}>{t('新規作成', 'New')}</Button>
                <Button size="small" appearance="outline" icon={<CopyRegular />} onClick={startDuplicate} disabled={!selected || (editing && !draft?.id && selectedId === '')}>{t('複製', 'Duplicate')}</Button>
              </div>
              <span className={mergeClasses(s.groupLabel, s.fullRow)}>{t('作成したテンプレート', 'Your templates')}</span>
              {customs.length === 0 && <span className={mergeClasses(s.caption, s.fullRow)}>{t('まだありません。「新規作成」か、標準のテンプレートの「複製」から作れます。', 'None yet. Create one with "New", or duplicate a standard template.')}</span>}
              {customs.map(renderItem)}

              <span className={mergeClasses(s.groupLabel, s.fullRow)}>{t('標準', 'Standard')}</span>
              {builtins.map(renderItem)}

              {/* 使わない(無効)のものは、一覧の下にたたむ(配信カードの選択肢には出ない。ここから「また使う」で戻せる) */}
              {hiddenList.length > 0 && (
                <Button size="small" appearance="subtle" className={mergeClasses(s.fullRow, s.inactiveToggle)} icon={<EyeOffRegular />} onClick={() => setShowHidden((v) => !v)}>
                  {showHidden ? t(`使わないテンプレートをたたむ(${hiddenList.length})`, `Collapse inactive templates (${hiddenList.length})`) : t(`使わないテンプレート(${hiddenList.length})`, `Inactive templates (${hiddenList.length})`)}
                </Button>
              )}
              {showHidden && hiddenList.map(renderItem)}
            </div>

            <div className={s.editor}>
              {error && (
                <MessageBar layout="multiline" intent="error">
                  <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
              )}

              {/* 使っている配信があるテンプレートを編集しているときは、保存しても、その配信は今の形のままと知らせる */}
              {draft?.id && usageOf(draft.id).total > 0 && (
                <MessageBar layout="multiline" intent="warning">
                  <MessageBarBody>
                    {t(
                      `${usageText(draft.id)}。保存しても、これらの配信は今の形のままです。これから作る配信と、テンプレートを選び直した配信から、新しい形になります。`,
                      `${usageText(draft.id)}. Saving keeps those deliveries on the current version. New deliveries and ones that re-select this template get the new version.`,
                    )}
                  </MessageBarBody>
                </MessageBar>
              )}
              {draft ? (
                <div className={s.editorGrid}>
                  <div className={s.fields}>
                    <Field label={t('テンプレート名', 'Template name')} required>
                      <Input size="small" value={draft.name} onChange={(_, d) => patch({ name: d.value })} />
                    </Field>
                    {draft.id && (
                      <Field label={t(`変更のメモ(任意。版 ${currentVersion(draft.id) + 1} の履歴に残ります)`, `Change note (optional; kept in the v${currentVersion(draft.id) + 1} history)`)}>
                        <Input size="small" value={draft.note ?? ''} placeholder={t('例: グリッドを 3 列に', 'e.g. Grid to 3 columns')} onChange={(_, d) => patch({ note: d.value })} />
                      </Field>
                    )}
                    <Field label={t('説明', 'Description')}>
                      <AutoTextarea rows={2} size="small" value={draft.description} onChange={(_, d) => patch({ description: d.value })} />
                    </Field>

                    {draft.push && (
                      <div className={s.card}>
                        <div className={s.cardHead}>
                          <span className={s.cardTitle}>{t('通知', 'Notification')}</span>
                          <span className={s.caption}>{t('アプリの通知の形。メッセージの本文は、下の部品で組みます', 'The notification format. Build the in-app message with the parts below.')}</span>
                        </div>
                        <div className={s.heroBody}>
                          <Field label={t('通知の形', 'Format')}>
                            <div className={s.row} style={{ flexWrap: 'nowrap' }}>
                              {(
                                [
                                  ['text', t('テキストだけ', 'Text only')],
                                  ['image', t('画像つき(メイン画像)', 'With image (main image)')],
                                ] as const
                              ).map(([k, label]) => {
                                const on = k === 'image' ? draft.push!.image : !draft.push!.image
                                return (
                                  <Button
                                    key={k}
                                    size="small"
                                    appearance={on ? 'primary' : 'outline'}
                                    aria-pressed={on}
                                    onClick={() => patch({ push: { ...draft.push!, image: k === 'image' } })}
                                  >
                                    {label}
                                  </Button>
                                )
                              })}
                            </div>
                          </Field>
                          <Field label={t('通知のボタン(最大 2 つ。空なら、ボタンなし)', 'Notification buttons (up to 2; empty = none)')}>
                            <div className={s.row}>
                              {[0, 1].map((i) => (
                                <Input
                                  key={i}
                                  size="small"
                                  value={draft.push!.buttons[i] ?? ''}
                                  placeholder={i === 0 ? t('例: 見る', 'e.g. View') : t('例: あとで', 'e.g. Later')}
                                  maxLength={MAX_BUTTON_LABEL}
                                  onChange={(_, d) => {
                                    const b = [draft.push!.buttons[0] ?? '', draft.push!.buttons[1] ?? '']
                                    b[i] = d.value
                                    patch({ push: { ...draft.push!, buttons: b } }) // 空の欄は、保存のときに外す
                                  }}
                                />
                              ))}
                            </div>
                          </Field>
                        </div>
                      </div>
                    )}

                    <div className={s.card}>
                      <div className={s.cardHead}>
                        <span className={s.cardTitle}>{draft.push ? t('メッセージ: ヒーロー(メイン画像)', 'Message: hero (main image)') : t('ヒーロー(メイン画像)', 'Hero (main image)')}</span>
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
                      <Badge size="small" appearance="tint" color={selected.builtin ? 'informative' : 'brand'}>
                        {selected.builtin ? (selected.edited ? t('標準(編集済み)', 'Standard (edited)') : t('標準', 'Standard')) : t('作成したテンプレート', 'Your template')}
                      </Badge>
                      {selected.hidden && (
                        <Badge size="small" appearance="outline" color="subtle">
                          {t('使わない', 'Inactive')}
                        </Badge>
                      )}
                      {selected.id !== 'free' && (
                        <Badge size="small" appearance="outline">
                          {t(`いまの版: 版 ${currentVersion(selected.id)}`, `Latest: v${currentVersion(selected.id)}`)}
                        </Badge>
                      )}
                    </div>
                    <span className={s.caption}>{usageOf(selected.id).total > 0 ? usageText(selected.id) : t('どの配信でも使っていません', 'Not used by any delivery')}</span>
                    <span className={s.caption}>{selected.description || t('(説明なし)', '(No description)')}</span>
                    {selected.push && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 12, rowGap: 4 }}>
                        <span className={s.caption}>{t('通知の中身', 'Contents')}</span>
                        <span style={{ fontSize: tokens.fontSizeBase200 }}>
                          {[t('タイトル', 'Title'), t('本文', 'Body'), selected.push.image ? t('メイン画像', 'Main image') : '']
                            .filter(Boolean)
                            .join(t('、', ', '))}
                        </span>
                        <span className={s.caption}>{t('ボタン', 'Buttons')}</span>
                        <span style={{ fontSize: tokens.fontSizeBase200 }}>{selected.push.buttons.length ? selected.push.buttons.join(t('、', ', ')) : t('なし', 'None')}</span>
                      </div>
                    )}
                    {(
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
                    )}
                    {/* 標準も、作成したものも、同じボタン。使っているものは削除できないので、使わない(無効)にする */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {canEdit(selected) && (
                        <Button size="small" appearance="primary" icon={<EditRegular />} onClick={startEdit} disabled={busy}>
                          {t('編集', 'Edit')}
                        </Button>
                      )}
                      <Button size="small" appearance="outline" icon={<CopyRegular />} onClick={startDuplicate} disabled={busy}>
                        {t('複製', 'Duplicate')}
                      </Button>
                      {selected.hidden ? (
                        <Button size="small" appearance="outline" icon={<EyeRegular />} onClick={() => void toggleHidden(false)} disabled={busy}>
                          {t('また使う', 'Reactivate')}
                        </Button>
                      ) : !selected.builtin && usageOf(selected.id).total === 0 ? (
                        <Button size="small" appearance="outline" icon={<DeleteRegular />} onClick={() => void remove()} disabled={busy}>
                          {t('削除', 'Delete')}
                        </Button>
                      ) : (
                        <Button size="small" appearance="outline" icon={<EyeOffRegular />} onClick={() => void toggleHidden(true)} disabled={busy}>
                          {t('使わないにする', 'Make inactive')}
                        </Button>
                      )}
                      {selected.edited && (
                        <Button size="small" appearance="subtle" icon={<ArrowResetRegular />} onClick={() => void reset()} disabled={busy}>
                          {t('最初の形に戻す', 'Reset to original')}
                        </Button>
                      )}
                    </div>
                    <span className={s.caption}>
                      {selected.builtin
                        ? t('標準のテンプレートも編集できます(コードの定義が版 0)。保存するたびに新しい版になり、使っている配信は、使った版の形のままです。標準は削除できないので、要らなければ「使わないにする」。', 'Standard templates can be edited too (the built-in definition is v0). Each save creates a new version; deliveries keep the version they used. Standards cannot be deleted; make them inactive instead.')
                        : usageOf(selected.id).total > 0
                          ? t('使っている配信があるので、削除の代わりに「使わないにする」(配信カードの選択肢から外れます。使っている配信は、そのまま)。', 'In use, so make it inactive instead of deleting it (it leaves the delivery card choices; deliveries keep it).')
                          : t('どの版も、どの配信でも使っていないので、削除できます。', 'No version is in use, so it can be deleted.')}
                    </span>
                    {selected.id !== 'free' && versionHistory(selected.id)}
                    {usedBy(selected.id)}
                  </div>
                  <div className={s.preview}>
                    <Text size={200} weight="semibold">
                      {viewKey ? t(`構成のプレビュー(版 ${getTemplate(viewKey).version} を見ています)`, `Layout preview (viewing v${getTemplate(viewKey).version})`) : t('構成のプレビュー', 'Layout preview')}
                    </Text>
                    <div className={s.previewScroll}>
                      {(viewKey ? getTemplate(viewKey) : selected).push && <PushThumb spec={(viewKey ? getTemplate(viewKey) : selected).push!} width={160} />}
                      <TemplateThumb layout={viewKey ? getTemplate(viewKey) : selected} free={selected.id === 'free'} width={PREVIEW_WIDTH} />
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
