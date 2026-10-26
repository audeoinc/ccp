// 中ペインの「③ ヒーロー」(アプリの「④ メッセージ」の上も): メイン画像と、ヘッドライン・コピー、メールの件名・プリヘッダー。
// 以前の ProductsTab(mode = hero)を分けた(整理 第3段 ③)。中身と直し方は、配信カードの useCardEditor が返すものを、そのまま受け取る
import { useEffect, useState, type DragEvent } from 'react'
import { Button, Divider, Tab, TabList, mergeClasses, tokens } from '@fluentui/react-components'
import { ImageAddRegular } from '@fluentui/react-icons'
import type { HeroImage } from './models/heroImages'
import { HeroCandidates } from './HeroCandidates'
import { heroImage } from './images'
import { DND_HERO, SOURCE_AI } from './items'
import { tr, useT } from './i18n'
import { Row } from './ProductRow'
import { useSelection } from './useSelection'
import type { AiDrafts } from './useAiDrafts'
import { AiButton } from './AiButton'
import type { useCardEditor } from './useCardEditor'
import { useContentPaneStyles } from './contentPaneStyles'
import { Block, CopyTab, Finder, UndoBar } from './contentPaneParts'
import { heroMeta, revealTab, type FieldKey, type RegisterChat } from './contentPaneUtil'
import { getTemplate } from './templates'
import { partsOf } from './tables'
import { elementDescriptions } from './elements'
import { TemplatePartsList } from './PartContentFields'
import { hasPartFields } from './partContent'

type CardEditor = ReturnType<typeof useCardEditor>

interface Props {
  /** 配信カードの中身と直し方(useCardEditor が返すもの) */
  editor: Pick<
    CardEditor,
    'form' | 'setForm' | 'template' | 'items' | 'setItems' | 'candidates' | 'setCandidates' | 'heroId' | 'setHeroId' | 'heroReason' | 'setHeroReason' | 'heroCandidates' | 'setHeroCandidates' | 'poolHeroes' | 'saving' | 'templateChannel' | 'partContent' | 'setPartContent' | 'ab'
  >
  drafts: AiDrafts
  /** すべてのメイン画像(載せた画像の表示用。選ぶ対象は editor.poolHeroes) */
  heroes: HeroImage[]
  /** 開いているサブタブを、AI チャットの対象として中ペインに知らせる */
  registerChat: RegisterChat
  /** AB テストで件名を案ごとに持ち、B・C 案を編集中なら、その案の記号(件名の案を A 案と違う切り口にする) */
  subjectAbKey?: string
  /** 持っている画像を上げる(メイン画像のライブラリへ。X59) */
  onUploadHero?: () => void
}

export function HeroTab({ editor, drafts, heroes, registerChat, subjectAbKey, onUploadHero }: Props) {
  const s = useContentPaneStyles()
  const t = useT()
  const { form, setForm, template, items, setItems, candidates, setCandidates, heroId, setHeroId, heroReason, setHeroReason, heroCandidates, setHeroCandidates, poolHeroes, templateChannel: channel } = editor
  const disabled = editor.saving
  // ドラッグ中に光らせる場所(セクションのタブと同じ仕組み)
  const { dropKey, setDropKey, overTarget, leaveTarget } = useSelection({ template, items, setItems, candidates, setCandidates })
  const [sub, setSub] = useState<'hero' | 'copy'>('hero')
  const active: 'hero' | 'copy' = sub === 'copy' ? 'copy' : 'hero'
  const heroById = new Map(heroes.map((x) => [x.id, x]))
  const noTheme = !form.theme.trim()
  const onField = (key: FieldKey, value: string) => setForm((f) => ({ ...f, [key]: value }))

  // ---- AI の選定結果は、そのまま設定する。直前の状態は「元に戻す」で復元できる
  const [undo, setUndo] = useState<{ message: string; run: () => void } | null>(null)

  const selectHero = async () => {
    const prev = { id: heroId, reason: heroReason, cands: heroCandidates }
    const result = await drafts.runHero()
    if (!result) return false
    if (result.hero) {
      setHeroId(result.hero.heroId)
      setHeroReason(result.hero.reason)
    }
    setHeroCandidates(result.candidates)
    setUndo({
      message: tr('AIがメイン画像の選定をしました(直す場合は、ドラッグ&ドロップで入れ替えられます)', 'AI selected the main image (to adjust, swap items by drag & drop)'),
      run: () => {
        setHeroId(prev.id)
        setHeroReason(prev.reason)
        setHeroCandidates(prev.cands)
      },
    })
    return true
  }

  // チャットの対象: 開いているサブタブ(メイン画像 / ヘッドライン・コピー)
  useEffect(() => {
    if (active === 'copy') registerChat({ key: 'hero-copy', title: tr('ヘッドライン・コピー', 'Headline & copy') }, () => drafts.runCopy())
    else registerChat({ key: 'hero-image', title: tr('メイン画像', 'Main image') }, selectHero)
  })

  const undoAlert = <UndoBar undo={undo} onDone={() => setUndo(null)} />

  // ---- 下段のタブ(メイン画像 / ヘッドライン・コピー)
  const subTabs = (
    <TabList
      size="small"
      className={s.tabs}
      selectedValue={active}
      onTabSelect={(_, d) => {
        setSub(d.value as 'hero' | 'copy')
        setUndo(null)
      }}
    >
      <Tab value="hero" onClick={revealTab}>{`${heroId ? '✓ ' : ''}${t('メイン画像', 'Main image')}`}</Tab>
      <Tab value="copy" onClick={revealTab}>{`${form.headline || form.copy ? '✓ ' : ''}${drafts.copyIdeas.length ? '● ' : ''}${t('ヘッドライン・コピー', 'Headline & copy')}`}</Tab>
    </TabList>
  )

  // ---- メイン画像の表示
  const setHero = (id: string, reason: string) => {
    // いま設定中の画像は、候補へ回す
    if (heroId && heroId !== id) {
      setHeroCandidates((prev) => [{ heroId: heroId, reason: heroReason }, ...prev.filter((c) => c.heroId !== id && c.heroId !== heroId)])
    } else {
      setHeroCandidates((prev) => prev.filter((c) => c.heroId !== id))
    }
    setHeroId(id)
    setHeroReason(reason)
  }

  const startHeroDrag = (id: string) => (e: DragEvent) => {
    e.dataTransfer.setData(DND_HERO, id)
    e.dataTransfer.effectAllowed = 'move'
  }
  const dropHero = (onId: (id: string) => void) => (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDropKey(null)
    const id = e.dataTransfer.getData(DND_HERO)
    if (id) onId(id)
  }
  /** 選定中のメイン画像を、候補へ戻す */
  const demoteHero = () => {
    const cur = heroById.get(heroId ?? '')
    if (!cur) return
    setHeroCandidates((prev) => [{ heroId: cur.id, reason: heroReason }, ...prev])
    setHeroId(undefined)
    setHeroReason('')
  }

  // ヒーローの下の表の部品(書き換え・差し替えを許したボタン・テキスト・画像。T8 段階 6。シンプルな配信カードの部品のペインと同じ欄)
  const layout = getTemplate(template)
  const heroTableParts = layout.heroTable ? partsOf(layout.heroTable).filter(hasPartFields).sort((a, b) => a.r - b.r || a.c - b.c) : []
  const descs = elementDescriptions(layout)
  const heroParts = heroTableParts.length > 0 && (
    <Block title={t('メイン画像の下の部品(文・画像)', 'Parts under the main image (text and images)')}>
      <TemplatePartsList parts={heroTableParts} label={(p) => descs.get(p.id) ?? p.id} value={editor.partContent} onChange={editor.setPartContent} variants={!!editor.ab} />
    </Block>
  )

  const heroView = () => {
    const busy = !!drafts.busy.hero
    const header = (
      <div className={s.flexRow}>
        <AiButton busy={busy} disabled={noTheme || disabled} onClick={selectHero}>
          {t('メイン画像をAIで選定', 'Select main image with AI')}
        </AiButton>
        {noTheme && <span className={s.warn}>{t('先にテーマを決めてください', 'Set a theme first')}</span>}
      </div>
    )

    const current = heroById.get(heroId ?? '')
    return (
      <div className={s.grid8}>
        {header}
        {undoAlert}
        <span className={s.semibold} style={{ fontSize: tokens.fontSizeBase200 }}>{t('選定済み(メイン画像)', 'Selected (main image)')}</span>
        {current ? (
          <Row
            wide
            drag={{
              draggable: true,
              onDragStart: startHeroDrag(current.id),
              onDragOver: overTarget('hero-sel'),
              onDragLeave: leaveTarget('hero-sel'),
              onDrop: dropHero((id) => {
                if (id === current.id) return
                setHero(id, heroCandidates.find((c) => c.heroId === id)?.reason ?? '')
              }),
            }}
            highlight={dropKey === 'hero-sel'}
            image={heroImage(current)}
            title={current.name}
            meta={heroMeta(current)}
            reason={heroReason}
            onReason={setHeroReason}
            actions={
              <Button
                size="small"
                appearance="subtle"
                onClick={() => {
                  setHeroCandidates((prev) => [{ heroId: current.id, reason: heroReason }, ...prev])
                  setHeroId(undefined)
                  setHeroReason('')
                }}
              >
                {t('外す', 'Remove')}
              </Button>
            }
          />
        ) : (
          <div
            onDragOver={overTarget('hero-sel')}
            onDragLeave={leaveTarget('hero-sel')}
            onDrop={dropHero((id) => setHero(id, heroCandidates.find((c) => c.heroId === id)?.reason ?? ''))}
            className={mergeClasses(s.heroEmpty, dropKey === 'hero-sel' && s.heroEmptyActive)}
          >
            <span className={s.caption}>{t('まだ選定されていません。「AIで案出し」か、下の候補・一覧から選んでください(ドラッグでも設定できます)。', 'Nothing selected yet. Use AI suggestions or pick from the candidates and list below (you can also drag to set).')}</span>
          </div>
        )}
        <div
          onDragOver={overTarget('hero-cands')}
          onDragLeave={leaveTarget('hero-cands')}
          onDrop={dropHero((id) => {
            if (id === heroId) demoteHero()
          })}
          className={mergeClasses(s.dropZone, dropKey === 'hero-cands' && s.dropActive)}
        >
          <Divider alignContent="start"><span className={s.caption}>{t(`残りの候補(${heroCandidates.length}件)`, `Remaining candidates (${heroCandidates.length})`)}</span></Divider>
          {heroCandidates.length === 0 && <span className={s.caption}>{t('候補はありません(候補は、AIが案を出したときだけ表示されます。保存はされません。選定中の画像をここへドラッグすると、候補へ戻せます)。', 'No candidates (candidates appear only when AI suggests them and are not saved. Drag the selected image here to move it back to candidates).')}</span>}
          {heroCandidates.map((c) => {
            const h = heroById.get(c.heroId)
            return (
              <Row
                key={c.heroId}
                wide
                dim
                drag={{ draggable: true, onDragStart: startHeroDrag(c.heroId) }}
                image={heroImage(h)}
                title={h?.name ?? ''}
                meta={heroMeta(h)}
                reason={c.reason}
                source={SOURCE_AI}
                actions={<Button size="small" appearance="outline" onClick={() => setHero(c.heroId, c.reason)}>{t('選ぶ', 'Select')}</Button>}
              />
            )
          })}
        </div>
        <Finder label={t('すべての画像から探す', 'Browse all images')}>
          <HeroCandidates heroes={poolHeroes} selectedId={heroId} onSelect={(id) => setHero(id, '')} />
        </Finder>
        {/* AI の案 → 頼み直す → ほかから選ぶ、で合わなければ、持っている画像を上げる(X59) */}
        {onUploadHero && (
          <div className={s.uploadRow}>
            <Button size="small" icon={<ImageAddRegular />} onClick={onUploadHero}>
              {t('持っている画像を上げる', 'Upload your own image')}
            </Button>
            <span className={s.caption}>{t('ライブラリに入り、この配信のメイン画像になります。次の配信からは候補にも出ます', 'It goes into the library and becomes this delivery’s hero. Later deliveries can pick it too')}</span>
          </div>
        )}
      </div>
    )
  }

  // ---- ヘッドライン・コピー(メイン画像の上に載るヘッドラインと、その下のコピー。組で案を出す)
  const copyView = (
    <CopyTab
      headline={form.headline}
      lead={form.copy}
      onHeadline={(v) => {
        onField('headline', v)
        onField('copyAngle', '')
      }}
      onLead={(v) => {
        onField('copy', v)
        onField('copyAngle', '')
      }}
      ideas={drafts.copyIdeas}
      savedAngle={form.copyAngle}
      onAdopt={(idea) => {
        onField('headline', idea.headline)
        onField('copy', idea.lead)
        onField('copyAngle', idea.angle)
      }}
      busy={!!drafts.busy.copy}
      blocked={noTheme ? t('先にテーマを決めてください', 'Set a theme first') : undefined}
      onGenerate={drafts.runCopy}
    />
  )
  // メールの件名・プリヘッダー(X2)。受信一覧で最初に目に入る文。プレビューの上に、受信一覧での見え方を出す
  const inboxView = channel !== 'push' && (
    <div className={s.inboxBlock}>
      <CopyTab
        subject={{ deliveryName: form.name ?? '', abKey: subjectAbKey }}
        headline={form.subject ?? ''}
        lead={form.preheader ?? ''}
        onHeadline={(v) => onField('subject', v)}
        onLead={(v) => onField('preheader', v)}
        ideas={drafts.subjectIdeas}
        onAdopt={(idea) => {
          onField('subject', idea.headline)
          onField('preheader', idea.lead)
        }}
        busy={!!drafts.busy.subject}
        blocked={noTheme ? t('先にテーマを決めてください', 'Set a theme first') : undefined}
        onGenerate={drafts.runSubject}
      />
    </div>
  )

  return (
    <div className={s.grid12}>
      {subTabs}
      {active === 'hero' ? (
        <>
          {heroView()}
          {heroParts}
        </>
      ) : (
        <>
          {copyView}
          {inboxView}
        </>
      )}
    </div>
  )
}
