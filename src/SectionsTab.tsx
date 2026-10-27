// 中ペインの「④ セクション」(アプリの「④ メッセージ」の下も): セクションごとの見出し・コピー・商品。
// 以前の ProductsTab(mode = sections)を分けた(整理 第3段 ③)。中身と直し方は、配信カードの useCardEditor が返すものを、そのまま受け取る
import { useEffect, useState } from 'react'
import { Badge, Button, Divider, Field, MessageBar, MessageBarActions, MessageBarBody, Tab, TabList, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowDownRegular, ArrowUpRegular, DismissRegular } from '@fluentui/react-icons'
import { AutoTextarea } from './AutoTextarea'
import type { Product } from './models/products'
import { Candidates } from './Candidates'
import { productImage } from './images'
import { tr, useT } from './i18n'
import { Row, productMeta } from './ProductRow'
import { ProductFloat } from './ProductFloat'
import { AlertChip, LowStockBadge } from './ProductMarks'
import type { CardAlertKind } from './cardAlerts'
import { useSelection } from './useSelection'
import { getTemplate, type SectionInfo } from './templates'
import { replaceSection } from './slots'
import { partsOf } from './tables'
import { elementDescriptions } from './elements'
import { TemplatePartsList } from './PartContentFields'
import { hasPartFields } from './partContent'
import type { AiDrafts } from './useAiDrafts'
import { AiButton } from './AiButton'
import type { useCardEditor } from './useCardEditor'
import { useContentPaneStyles } from './contentPaneStyles'
import { Block, Finder, UndoBar } from './contentPaneParts'
import { revealTab, type RegisterChat } from './contentPaneUtil'

type CardEditor = ReturnType<typeof useCardEditor>

interface Props {
  /** 配信カードの中身と直し方(useCardEditor が返すもの) */
  editor: Pick<CardEditor, 'form' | 'template' | 'sectionTitles' | 'sectionCopies' | 'setSectionTitle' | 'setSectionCopy' | 'items' | 'setItems' | 'candidates' | 'setCandidates' | 'poolProducts' | 'saving' | 'partContent' | 'setPartContent' | 'ab'>
  drafts: AiDrafts
  /** すべての商品(載せた商品の表示用。選ぶ対象は editor.poolProducts) */
  products: Product[]
  /** 開いているサブタブを、AI チャットの対象として中ペインに知らせる */
  registerChat: RegisterChat
  /** アラートのある商品(商品 ID → いちばん強い種類)。選定済みの行に札を出す(商品情報の一覧と同じ) */
  alertKinds?: Map<string, CardAlertKind>
  /** アラートの札を押したとき(その商品のアラートへの対応を開く) */
  onAlert?: (productId: string) => void
  /** 選定済みの行を押したとき(商品の対応のフロートを開く。X54) */
  onOpenProduct?: (itemKey: string) => void
}

export function SectionsTab({ editor, drafts, products, registerChat, alertKinds, onAlert, onOpenProduct }: Props) {
  const s = useContentPaneStyles()
  const t = useT()
  const { form, template, sectionTitles, sectionCopies, setSectionTitle: onSectionTitle, setSectionCopy: onSectionCopy, items, setItems, candidates, setCandidates, poolProducts } = editor
  const disabled = editor.saving
  const { sections, listOf, isFull, moveInSection, demote, dropKey, setDropKey, startDrag, overTarget, leaveTarget, dropOnSelected, dropOnSelectedArea, dropOnCandidates, promote, addManual, setItemReason, setCandReason, toItems } = useSelection({ template, items, setItems, candidates, setCandidates })
  const [sub, setSub] = useState<number>(0)
  // 折りたたんだブロック(「セクション番号:ブロック」)。セクションを切り替えても、それぞれの開閉を覚えておく
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const fold = (key: string) => ({
    open: !collapsed.has(key),
    onToggle: () =>
      setCollapsed((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      }),
  })
  const active: number = Math.min(sub, sections.length - 1)
  const productById = new Map(products.map((x) => [x.id, x]))
  const noTheme = !form.theme.trim()

  // ---- AI の選定結果は、そのまま設定する。直前の状態は「元に戻す」で復元できる
  const [undo, setUndo] = useState<{ message: string; run: () => void } | null>(null)

  // 見出しを変えたら、コピー・商品の作り直しをゆるやかに促す(自動では作り直さない)
  const [hint, setHint] = useState<string | null>(null)
  const changeTitle = (sec: SectionInfo, title: string) => {
    onSectionTitle(sec.index, title)
    if ((sectionCopies[sec.index] ?? '') || listOf(sec).length > 0) setHint(t('見出しを変更しました。必要なら、② コピー・③ 商品を作り直してください。', 'The heading was changed. If needed, regenerate (2) Copy and (3) Products.'))
  }

  const sectionLabel = (sec: SectionInfo) => (sec.wantTitle ? sectionTitles[sec.index] || sec.label : sec.label)

  /** セクション 1 つを一括で(見出し・コピー・商品を、それぞれ第 1 候補で設定する) */
  const selectSection = async (sec: SectionInfo) => {
    const prevItems = items
    const prevCands = candidates
    const prevTitle = sectionTitles[sec.index] ?? ''
    const prevCopy = sectionCopies[sec.index] ?? ''
    const result = await drafts.runSection(sec.index)
    if (!result) return false
    // そのセクションの枠に置き換える(前のセクションが空いていても、前の枠に詰まらない。src/slots.ts)
    setItems(replaceSection(prevItems, sections, sec.index, toItems(result.selected)))
    setCandidates([...prevCands.filter((c) => c.section !== sec.index), ...toItems(result.candidates).map((c) => ({ ...c, section: sec.index }))])
    if (sec.wantTitle && result.title.trim()) onSectionTitle(sec.index, result.title.trim())
    if (result.copy.trim()) onSectionCopy(sec.index, result.copy.trim())
    setHint(null)
    setUndo({
      message: tr(`AIが${sectionLabel(sec)}の選定をしました(直す場合は、ドラッグ&ドロップで入れ替えられます)`, `AI re-selected ${sectionLabel(sec)} (to adjust, swap items by drag & drop)`),
      run: () => {
        setItems(prevItems)
        setCandidates(prevCands)
        if (sec.wantTitle) onSectionTitle(sec.index, prevTitle)
        onSectionCopy(sec.index, prevCopy)
      },
    })
    return true
  }

  /** 見出しだけ作り直す(第 1 候補を設定) */
  const selectTitles = async (sec: SectionInfo) => {
    const prevTitle = sectionTitles[sec.index] ?? ''
    const titles = await drafts.runSectionTitles(sec.index)
    if (!titles?.[0]) return
    changeTitle(sec, titles[0].title)
    setUndo({ message: tr(`AIが${sectionLabel(sec)}の見出しの作り直しをしました(直す場合は、ドラッグ&ドロップで入れ替えられます)`, `AI regenerated the heading for ${sectionLabel(sec)} (to adjust, swap items by drag & drop)`), run: () => onSectionTitle(sec.index, prevTitle) })
  }

  /** コピーだけ作り直す(第 1 候補を設定。現在の見出しと、選ばれた商品を踏まえる) */
  const selectCopies = async (sec: SectionInfo) => {
    const prevCopy = sectionCopies[sec.index] ?? ''
    const copies = await drafts.runSectionCopies(sec.index)
    if (!copies?.[0]) return
    onSectionCopy(sec.index, copies[0].copy)
    setUndo({ message: tr(`AIが${sectionLabel(sec)}のコピーの作り直しをしました(直す場合は、ドラッグ&ドロップで入れ替えられます)`, `AI regenerated the copy for ${sectionLabel(sec)} (to adjust, swap items by drag & drop)`), run: () => onSectionCopy(sec.index, prevCopy) })
  }

  /** 商品だけ選び直す(現在の見出しとコピーを踏まえる) */
  const selectProducts = async (sec: SectionInfo) => {
    const prevItems = items
    const prevCands = candidates
    const result = await drafts.runSectionProducts(sec.index)
    if (!result) return
    // そのセクションの枠に置き換える(前のセクションが空いていても、前の枠に詰まらない。src/slots.ts)
    setItems(replaceSection(prevItems, sections, sec.index, toItems(result.selected)))
    setCandidates([...prevCands.filter((c) => c.section !== sec.index), ...toItems(result.candidates).map((c) => ({ ...c, section: sec.index }))])
    setUndo({
      message: tr(`AIが${sectionLabel(sec)}の商品の選び直しをしました(直す場合は、ドラッグ&ドロップで入れ替えられます)`, `AI re-selected the products for ${sectionLabel(sec)} (to adjust, swap items by drag & drop)`),
      run: () => {
        setItems(prevItems)
        setCandidates(prevCands)
      },
    })
  }

  // チャットの対象: 開いているセクション
  useEffect(() => {
    const sec = sections[active]
    if (sec) registerChat({ key: `section-${sec.index}`, title: sectionLabel(sec) }, () => selectSection(sec))
  })

  const undoAlert = <UndoBar undo={undo} onDone={() => setUndo(null)} />

  // ---- 下段のタブ(各セクション)
  const subTabs = (
    <TabList
      size="small"
      className={s.tabs}
      selectedValue={active}
      onTabSelect={(_, d) => {
        setSub(d.value as number)
        setUndo(null)
      }}
    >
      {sections.map((sec) => {
        const title = sec.wantTitle ? sectionTitles[sec.index] || sec.label : sec.label
        const n = listOf(sec).length
        const count = Number.isFinite(sec.slots) ? `${n}/${sec.slots}` : `${n}`
        return <Tab key={sec.index} value={sec.index} onClick={revealTab}>{`${title}(${count})`}</Tab>
      })}
    </TabList>
  )

  // ---- セクションの表示(① 見出し → ② コピー → ③ 商品)
  const sectionView = (sec: SectionInfo) => {
    const i = sec.index
    const busyAll = !!drafts.busy[`section:${i}`]
    const busyTitle = !!drafts.busy[`section:${i}:title`]
    const busyCopy = !!drafts.busy[`section:${i}:copy`]
    const busyProducts = !!drafts.busy[`section:${i}:products`]
    const anyBusy = busyAll || busyTitle || busyCopy || busyProducts

    const list = listOf(sec)
    const cands = candidates.filter((c) => c.section === i)
    const usedIds = new Set([...items, ...candidates].map((x) => x.productId))
    const titles = drafts.titleCandidates[i] ?? []
    const copies = drafts.sectionCopyCandidates[i] ?? []
    const currentTitle = sectionTitles[i] ?? ''
    const currentCopy = sectionCopies[i] ?? ''
    // テンプレートの部品(表のセクションの、書き換え・差し替えを許したテキスト・ボタン・画像。T8 段階 6。シンプルな配信カードの部品のペインと同じ欄)
    const layout = getTemplate(template)
    const tparts = [...partsOf(layout.sections[i] ?? { kind: 'grid', slots: 0 })].filter(hasPartFields).sort((a, b) => a.r - b.r || a.c - b.c)
    const descs = elementDescriptions(layout)
    const changedParts = tparts.filter((p) => editor.partContent[p.id]).length
    const partNo = sec.wantTitle ? 4 : 3

    const header = (
      <div className={s.flexRow}>
        <AiButton busy={busyAll} disabled={noTheme || disabled || anyBusy} onClick={() => selectSection(sec)}>
          {t('このセクションをまとめてAIで選定', 'Select this whole section with AI')}
        </AiButton>
        {noTheme && <span className={s.warn}>{t('先にテーマを決めてください', 'Set a theme first')}</span>}
      </div>
    )

    return (
      <div className={s.grid12}>
        {header}
        {undoAlert}
        {hint && (
          <MessageBar layout="multiline" intent="info">
            <MessageBarBody>{hint}</MessageBarBody>
            <MessageBarActions
              containerAction={<Button appearance="transparent" size="small" aria-label={t('閉じる', 'Close')} icon={<DismissRegular />} onClick={() => setHint(null)} />}
            />
          </MessageBar>
        )}

        {sec.wantTitle && (
          <Block
            {...fold(`${i}:title`)}
            summary={currentTitle || t('(未設定)', '(not set)')}
            title={t('① 見出し(切り口)', '1. Heading (angle)')}
            right={
              <AiButton busy={busyTitle} disabled={noTheme || disabled || anyBusy} onClick={() => selectTitles(sec)}>
                {titles.length ? t('作り直す', 'Regenerate') : t('AIで作る', 'Generate with AI')}
              </AiButton>
            }
          >
            <span className={s.value}>{currentTitle || t('(未設定)', '(not set)')}</span>
            {titles.map((ti) => {
              const current = currentTitle === ti.title
              return (
                <div key={ti.title} onClick={() => changeTitle(sec, ti.title)} className={mergeClasses(s.pick, current && s.pickCurrent)}>
                  <div className={s.flexRowTight}>
                    <span className={s.semibold}>{ti.title}</span>
                    {current && <Badge size="small" appearance="filled" color="brand">{t('設定中', 'Current')}</Badge>}
                  </div>
                  <span className={s.caption}>{ti.reason}</span>
                </div>
              )
            })}
            {titles.length > 0 && <span className={s.caption}>{t('クリックで差し替えます。書き換えは、プレビューの見出しから。', 'Click to swap. To rewrite it, edit the heading in the preview.')}</span>}
          </Block>
        )}

        <Block
          {...fold(`${i}:copy`)}
          summary={currentCopy || t('(未設定)', '(not set)')}
          title={`${sec.wantTitle ? '② ' : '① '}${t('コピー', 'Copy')}`}
          right={
            <>
              <AiButton busy={busyCopy} disabled={noTheme || disabled || anyBusy} onClick={() => selectCopies(sec)}>
                {copies.length ? t('作り直す', 'Regenerate') : t('AIで作る', 'Generate with AI')}
              </AiButton>
            </>
          }
        >
          <Field label={t('セクションのコピー(見出しの下に入ります)', 'Section copy (placed below the heading)')} size="small">
            <AutoTextarea heightKey="ContentPane.currentCopy" rows={2} size="small" value={currentCopy} onChange={(_, d) => onSectionCopy(i, d.value)} />
          </Field>
          {copies.map((c) => {
            const current = currentCopy === c.copy
            return (
              <div key={c.copy} onClick={() => onSectionCopy(i, c.copy)} className={mergeClasses(s.pick, current && s.pickCurrent)}>
                <div className={s.flexRowTight}>
                  {c.angle && <Badge size="small" appearance="tint" color="informative">{c.angle}</Badge>}
                  {current && <Badge size="small" appearance="filled" color="brand">{t('設定中', 'Current')}</Badge>}
                </div>
                <span style={{ fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200 }}>{c.copy}</span>
              </div>
            )
          })}
          {copies.length > 0 && <span className={s.caption}>{t('クリックで差し替えます。商品を選んだあとに「作り直す」と、商品を踏まえたコピーになります。', 'Click to swap. After selecting products, press "Regenerate" to get copy based on them.')}</span>}
        </Block>

        <Block
          {...fold(`${i}:products`)}
          summary={
            list.length
              ? `${list.map((it) => productById.get(it.productId)?.name ?? '').filter(Boolean).join(' / ')}${Number.isFinite(sec.slots) ? `(${list.length} / ${sec.slots})` : ''}`
              : t('(未選定)', '(None selected)')
          }
          title={`${sec.wantTitle ? '③ ' : '② '}${t('商品', 'Products')}`}
          right={
            <AiButton busy={busyProducts} disabled={noTheme || disabled || anyBusy} onClick={() => selectProducts(sec)}>
              {list.length ? t('選び直す', 'Re-select') : t('AIで選ぶ', 'Select with AI')}
            </AiButton>
          }
        >
          <span className={s.semibold} style={{ fontSize: tokens.fontSizeBase200 }}>
            {t(`選定済み(${list.length}${Number.isFinite(sec.slots) ? ` / ${sec.slots}` : ''}件)`, `Selected (${list.length}${Number.isFinite(sec.slots) ? ` / ${sec.slots}` : ''})`)}
          </span>
          <div
            onDragOver={overTarget('sel')}
            onDragLeave={leaveTarget('sel')}
            onDrop={(e) => {
              e.preventDefault()
              setDropKey(null)
              dropOnSelectedArea(sec, e.dataTransfer)
            }}
            className={mergeClasses(s.dropZone, dropKey === 'sel' && !isFull(sec) && s.dropActive)}
          >
            {list.length === 0 && <span className={s.caption}>{t('まだ選定されていません。「AIで案出し」か、下の候補・一覧から選んでください(ドラッグでも追加できます)。', 'Nothing selected yet. Use AI suggestions or pick from the candidates and list below (you can also drag to add).')}</span>}
            {list.map((it, k) => {
              const prod = productById.get(it.productId)
              const outside = Number.isFinite(sec.slots) && k >= sec.slots
              const alert = alertKinds?.get(it.productId)
              const row = (
                <Row
                  key={it.key}
                  drag={{
                    draggable: true,
                    onDragStart: startDrag('item', it.key, it.productId),
                    onDragOver: overTarget(it.key),
                    onDragLeave: leaveTarget(it.key),
                    onDrop: (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setDropKey(null)
                      dropOnSelected(sec, it, e.dataTransfer)
                    },
                  }}
                  highlight={dropKey === it.key}
                  image={productImage(prod)}
                  title={prod?.name ?? ''}
                  meta={productMeta(prod)}
                  reason={it.reason}
                  onReason={(v) => setItemReason(it.key, v)}
                  source={it.source}
                  badge={outside ? t('枠外', 'Outside slots') : undefined}
                  marks={
                    <>
                      <LowStockBadge product={prod} />
                      {alert && onAlert && <AlertChip kind={alert} onClick={() => onAlert?.(it.productId)} />}
                    </>
                  }
                  actions={
                    <>
                      <div>
                        <Button appearance="subtle" size="small" icon={<ArrowUpRegular />} disabled={k === 0} onClick={() => moveInSection(sec, it.key, -1)} aria-label={t('上へ', 'Move up')} />
                        <Button appearance="subtle" size="small" icon={<ArrowDownRegular />} disabled={k === list.length - 1} onClick={() => moveInSection(sec, it.key, 1)} aria-label={t('下へ', 'Move down')} />
                      </div>
                      <Button appearance="subtle" size="small" onClick={() => demote(sec, it)}>{t('外す', 'Remove')}</Button>
                    </>
                  }
                />
              )
              // 行を押すと、商品のフロート(右端の商品情報と同じもの)。そこから残りの候補と入れ替えられる(X47)
              return prod ? (
                <ProductFloat key={it.key} onOpen={onOpenProduct && (() => onOpenProduct?.(it.key))}>
                  {row}
                </ProductFloat>
              ) : (
                row
              )
            })}
          </div>
          <div
            onDragOver={overTarget('cands')}
            onDragLeave={leaveTarget('cands')}
            onDrop={(e) => {
              e.preventDefault()
              setDropKey(null)
              dropOnCandidates(sec, e.dataTransfer)
            }}
            className={mergeClasses(s.dropZone, dropKey === 'cands' && s.dropActive)}
          >
            <Divider alignContent="start"><span className={s.caption}>{t(`残りの候補(${cands.length}件)`, `Remaining candidates (${cands.length})`)}</span></Divider>
            {cands.length === 0 && <span className={s.caption}>{t('候補はありません(選定済みの行をここへドラッグすると、候補へ戻せます)。', 'No candidates (drag a selected row here to move it back to candidates).')}</span>}
            {cands.map((c) => {
              const prod = productById.get(c.productId)
              return (
                <Row
                  key={c.key}
                  drag={{ draggable: true, onDragStart: startDrag('cand', c.key, c.productId) }}
                  dim
                  image={productImage(prod)}
                  title={prod?.name ?? ''}
                  meta={productMeta(prod)}
                  reason={c.reason}
                  onReason={(v) => setCandReason(c.key, v)}
                  source={c.source}
                  actions={<Button size="small" appearance="outline" onClick={() => promote(sec, c)}>{t('選ぶ', 'Select')}</Button>}
                />
              )
            })}
          </div>
          <Finder label={t('すべての商品から探す', 'Browse all products')}>
            <Candidates products={poolProducts} usedIds={usedIds} onAdd={(id) => addManual(sec, id)} />
          </Finder>
        </Block>

        {tparts.length > 0 && (
          <Block
            {...fold(`${i}:parts`)}
            summary={changedParts ? t(`この配信で直した部品 ${changedParts}`, `${changedParts} part(s) changed for this delivery`) : t('テンプレートのまま', 'As in the template')}
            title={`${partNo === 4 ? '④ ' : '③ '}${t('テンプレートの部品(文・画像)', 'Template parts (text and images)')}`}
          >
            <TemplatePartsList parts={tparts} label={(p) => descs.get(p.id) ?? p.id} value={editor.partContent} onChange={editor.setPartContent} variants={!!editor.ab} />
          </Block>
        )}
      </div>
    )
  }

  return (
    <div className={s.grid12}>
      {subTabs}
      {sectionView(sections[active])}
    </div>
  )
}
