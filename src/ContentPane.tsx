import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Badge, Button, Field, Tab, TabList, Tooltip, mergeClasses } from '@fluentui/react-components'
import { TemplateThumb } from './TemplateThumb'
import { ChatPanel, type ChatMsg } from './ChatPanel'
import { AutoTextarea } from './AutoTextarea'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { withChat } from './aiSelect'
import { tr, useT } from './i18n'
import type { CardAlertKind } from './cardAlerts'
import { progressOf } from './progress'
import { openTemplateManager, sectionsOf, templateOptions, type EmailTemplateId, type TemplateChannel } from './templates'
import { useCountryApply } from './countryApply'
import type { AiDrafts } from './useAiDrafts'
import { LinksEditor } from './LinksEditor'
import { AppLinksEditor } from './AppLinksEditor'
import { AiButton } from './AiButton'
import { NotesEditor } from './NotesEditor'
import { PushThumb } from './PushThumb'
import { tapComplete } from './pushLink'
import { templateKeyState, type TemplateUse } from './templateUse'
import { TemplateKeyNote, TemplateUseLine } from './TemplateUseLine'
import type { useCardEditor } from './useCardEditor'
import { ownsSubject } from './abTest'
import { HeroTab } from './HeroTab'
import { SectionsTab } from './SectionsTab'
import { useContentPaneStyles } from './contentPaneStyles'
import { CopyTab } from './contentPaneParts'
import { revealTab, type FieldKey, type RegisterChat } from './contentPaneUtil'

import { MarkdownLite } from './MarkdownLite'
import { linkSlots, linksComplete, variantCampaign } from './links'

// 中ペインは、コンテンツを作る工程だけ。人とのやり取り(引き継ぎ・質問・タスク・コメント)は、右端の「プロセス」のペイン(ProcessPane)に移した(2026-10-17)
export type TopTab = 'theme' | 'template' | 'hero' | 'sections' | 'instructions' | 'links' | 'notice' | 'message' | 'timing'
type CardEditor = ReturnType<typeof useCardEditor>

interface Props {
  /** 配信カードの中身と直し方(useCardEditor が返すもの。状態と保存は配信カードの 1 か所。整理 第3段 ③) */
  editor: CardEditor
  drafts: AiDrafts
  /** すべての商品・メイン画像(載せたものの表示用。選ぶ対象は editor の poolProducts / poolHeroes) */
  products: Product[]
  heroes: HeroImage[]
  /** テンプレートを変える(セクションの構成が変わるので、AI の案も破棄する。配信カードの changeTemplate) */
  onTemplate: (id: EmailTemplateId) => void
  /** テンプレートごとの最近の使用回数(X4。選ぶときに出す) */
  templateUse?: Map<string, TemplateUse>
  /** ⑥ 制作指示の下に出す「参考の素材」(X58。素材は配信カードが持つので、出来上がった部品を受け取る) */
  assetsSlot?: ReactNode
  /** 持っている画像を上げる(メイン画像のライブラリへ。X59) */
  onUploadHero?: () => void
  /** アラートのある商品(商品 ID → いちばん強い種類)。選定済みの行に札を出す(商品情報の一覧と同じ) */
  alertKinds?: Map<string, CardAlertKind>
  /** アラートの札を押したとき(その商品のアラートへの対応を開く) */
  onAlert?: (productId: string) => void
  /** 選定済みの行を押したとき(商品の対応のフロートを開く。X54) */
  onOpenProduct?: (itemKey: string) => void
  /** リンク先のタブを開いた・閉じた(プレビューに、リンクの場所の番号を出すため。W12) */
  onLinksTab?: (open: boolean) => void
  /** 開いているタブが変わったとき(URL に持たせる。X36) */
  onTabChange?: (tab: TopTab) => void
  /** リンク先の設定の欄で選んでいる場所(プレビューで光らせる。W12) */
  onLinkFocus?: (key: string | null) => void
  /** 配信のページの名前(リンク先の既定値と、アプリの配信の campaign に使う) */
  campaign: string
  /** 計測用のパラメーターの utm_campaign の既定値(配信日 + 配信カードの ID。links.ts の campaignId) */
  utmCampaign: string
  /** AB テストの、いま編集している案(計測用のパラメーターの campaign の末尾に付ける。AB テストでなければ null。X55) */
  linkVariant?: string | null
  /** 外から、工程のタブを開く頼み。seq が変わるたびに開く */
  tabRequest?: { tab: TopTab; seq: number }
}



// ------------------------------------------------------------------ テーマ・コピー・制作指示: 案 → 採用

interface Idea {
  text: string
  chip?: string
  note?: string
}

function IdeaTab(props: {
  label: string
  value: string
  onChange: (v: string) => void
  ideas: Idea[]
  /** 保存済みの、採用した案の補足 */
  savedNote?: string
  savedChip?: string
  /** 案を採用した(手で書き換えたときの onChange とは分ける。補足も一緒に更新するため) */
  onAdopt: (idea: Idea) => void
  busy: boolean
  blocked?: string
  onGenerate: () => void
  /** 見たまま編集の入力欄(見出し・箇条書き。保存は Markdown)。制作指示で使う */
  rich?: boolean
}) {
  const s = useContentPaneStyles()
  const t = useT()
  const { label, value, onChange, ideas, savedNote, savedChip, onAdopt, busy, blocked, onGenerate, rich } = props
  const current = ideas.find((i) => i.text === value)
  const note = savedNote || current?.note
  const chip = savedChip || current?.chip
  return (
    <div className={s.grid12}>
      <div className={s.flexRow}>
        <AiButton busy={busy} disabled={!!blocked} onClick={onGenerate}>
          {ideas.length ? t('案を作り直す', 'Regenerate ideas') : t('AIで案を出す', 'Suggest with AI')}
        </AiButton>
        {blocked && <span className={s.warn}>{blocked}</span>}
      </div>
      <div className={s.group}>
        <Field
          label={
            <span className={s.flexRowTight}>
              {t(`現在の${label}`, `Current ${label}`)}
              <Badge size="small" appearance="filled" color="success">{t('採用中', 'In use')}</Badge>
            </span>
          }
          size="small"
        >
          {rich ? (
            <NotesEditor
              value={value}
              onChange={onChange}
              placeholder={t('「- 」で箇条書き、「1. 」で番号つき、「### 」で見出し', 'Type "- " for bullets, "1. " for numbers, "### " for a heading')}
            />
          ) : (
            <AutoTextarea heightKey="ContentPane.value" rows={2} value={value} onChange={(_, d) => onChange(d.value)} />
          )}
        </Field>
        {(note || chip) && value && (
          <div className={s.noteBox}>
            {chip && <Badge size="small" appearance="tint" color="informative">{chip}</Badge>}
            {note && <span><span className={s.lead}>{t('AIの理由:', 'AI rationale:')}</span>{` ${note}`}</span>}
          </div>
        )}
      </div>
      {ideas.length > 0 && <span className={s.listHead}><span className={s.lead}>{t('AIの案(未採用):', 'AI ideas (not adopted):')}</span> {t('「採用」を押すと、上の内容に反映されます', 'Press "Adopt" to apply it above')}</span>}
      {ideas.map((idea) => {
        const adopted = idea.text === value
        return (
          <div key={idea.text} className={mergeClasses(s.card, adopted && s.cardAdopted)}>
            {idea.chip && <Badge className={s.chipStart} size="small" appearance="tint" color="informative">{idea.chip}</Badge>}
            {rich ? <MarkdownLite text={idea.text} /> : <span className={idea.text.length > 40 ? s.preBody : s.pre}>{idea.text}</span>}
            {idea.note && <span className={s.caption}>{idea.note}</span>}
            <div className={s.flexEnd}>
              {adopted ? (
                <Badge size="small" appearance="filled" color="success">{t('採用中', 'In use')}</Badge>
              ) : (
                <Button size="small" appearance="primary" onClick={() => onAdopt(idea)}>{t('採用', 'Adopt')}</Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}


// ------------------------------------------------------------------ テンプレート

/** テンプレートの最近の使用回数の行(X4)。同じ国の配信を、この配信の配信日の前 4 週間・同じ週で数える */
function TemplateTab({ template, onTemplate, hasCandidates, channel, country, use }: { template: EmailTemplateId; onTemplate: (id: EmailTemplateId) => void; hasCandidates: boolean; channel: TemplateChannel; country?: string; use?: Map<string, TemplateUse> }) {
  const s = useContentPaneStyles()
  const t = useT()
  useCountryApply()
  return (
    <div className={s.grid12}>
      <span className={s.caption}>
        {channel === 'push'
          ? t('アプリの通知の形を選びます。', 'Choose the notification format.')
          : t('メールの構成を選びます。選んだテンプレートの枠に、商品が順に入ります。', 'Choose the email layout. Products fill the slots of the chosen template in order.')}
        {hasCandidates && t(' テンプレートを変えると、セクションの構成が変わるため、選定候補は破棄されます(選定済みの商品は残ります)。', ' Changing the template changes the section layout, so the candidates will be discarded (selected products are kept).')}
      </span>
      <div>
        <Button size="small" appearance="outline" onClick={openTemplateManager}>{t('テンプレートを管理(作成・編集)', 'Manage templates (create / edit)')}</Button>
      </div>
      {/* この配信が、テンプレートの前の版や、使わない(無効)のテンプレートを使っているとき。選択肢には出ないので、ここに出して知らせる */}
      {(() => {
        const k = templateKeyState(template, country)
        if (!k) return null
        return (
          <div className={mergeClasses(s.tplCard, s.tplCardSelected)}>
            {k.cur.push ? <PushThumb spec={k.cur.push} width={110} /> : <TemplateThumb layout={k.cur} maxHeight={170} zoom />}
            <div style={{ minWidth: 0 }}>
              <div className={s.flexRowTight}>
                <span className={s.bold}>{k.cur.label}</span>
                <Badge size="small" appearance="filled" color="brand">{t('選択中', 'Selected')}</Badge>
                {k.old && <Badge size="small" appearance="outline">{t(`版 ${k.version}`, `v${k.version}`)}</Badge>}
              </div>
              <TemplateKeyNote state={k} onUpdate={onTemplate} />
            </div>
          </div>
        )
      })()}
      {templateOptions(channel, false, country).map((o) => {
        const selected = o.id === template
        return (
          <div key={o.id} onClick={() => onTemplate(o.id)} className={mergeClasses(s.tplCard, selected && s.tplCardSelected)}>
            {o.push ? <PushThumb spec={o.push} width={110} /> : <TemplateThumb layout={o} free={o.id === 'free'} maxHeight={170} zoom />}
            <div style={{ minWidth: 0 }}>
              <div className={s.flexRowTight}>
                <span className={s.bold}>{o.label}</span>
                {selected && <Badge size="small" appearance="filled" color="brand">{t('選択中', 'Selected')}</Badge>}
              </div>
              <span className={s.caption}>{o.description}</span>
              {use && <TemplateUseLine u={use.get(o.id)} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}


// ------------------------------------------------------------------ 中ペイン全体

/** チャットの入力欄の上に出す、よく使う頼み方(対象ごと)。押すと入力欄に入る */
function chatSuggestions(key?: string): string[] {
  if (!key) return []
  if (key === 'theme') return [tr('もっとカジュアルな切り口で', 'Make it more casual'), tr('季節感を強めて', 'Lean harder on the season'), tr('売れ筋の商品を主役にして', 'Center it on best-selling products')]
  if (key === 'hero-image') return [tr('もっと明るい雰囲気の画像に', 'Pick a brighter, lighter image'), tr('商品が目立つ画像に', 'Pick an image where the products stand out')]
  if (key === 'hero-copy') return [tr('もっと短く', 'Make it shorter'), tr('行動を促す言い方に', 'Use a stronger call to action'), tr('上品で落ち着いた言い方に', 'Make the tone calmer and more refined')]
  if (key === 'instructions') return [tr('もっと簡潔に', 'Make it more concise'), tr('色味の指定を足して', 'Add color direction'), tr('CTAを目立たせて', 'Make the call to action stand out')]
  return [tr('必ず入れたい商品: ', 'Must include this product: '), tr('もっと手頃な価格の商品で', 'Use more affordable products'), tr('新作を優先して', 'Prioritize new arrivals')]
}

export function ContentPane(props: Props) {
  const s = useContentPaneStyles()
  const t = useT()
  const { drafts, onTemplate } = props
  const { form, setForm, template, candidates, items, heroId, links, setLinks, pushLink, setPushLink, templateChannel: channel, ab, active } = props.editor
  const { theme, headline, instructions } = form
  const onField = (key: FieldKey, value: string) => setForm((f) => ({ ...f, [key]: value }))
  // AB テストで件名を案ごとに持ち、B・C 案を編集中なら、その案の記号(件名の案を A 案と違う切り口にする)
  const subjectAbKey = ab && active !== 'A' && ownsSubject(ab) ? active : undefined
  const [tab, setTab] = useState<TopTab>('theme')
  const openTab = (next: TopTab) => setTab(next)
  // 外からのタブを開く頼み(左の配信情報の「引き継ぎのタブで決める」など)。seq が変わったときだけ開く
  const { tabRequest } = props
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tabRequest && tabRequest.seq > 0) openTab(tabRequest.tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabRequest?.seq])
  // リンク先のタブを開いている間だけ、プレビューにリンクの場所の番号を出す(タブを離れたら、選んでいた欄も外す)
  const { onLinksTab, onLinkFocus, onTabChange } = props
  useEffect(() => {
    onTabChange?.(tab)
  }, [tab, onTabChange])
  useEffect(() => {
    onLinksTab?.(tab === 'links')
    if (tab !== 'links') onLinkFocus?.(null)
  }, [tab, onLinksTab, onLinkFocus])

  // ---- AI チャット(開いているタブの案づくりに、指示と対話を加える)。会話は、タブ(対象)ごとに持つ。保存はしない
  const [chats, setChats] = useState<Record<string, ChatMsg[]>>({})
  const [chatTarget, setChatTarget] = useState<{ key: string; title: string } | null>(null)
  const [chatBusy, setChatBusy] = useState(false)
  const chatRun = useRef<(() => Promise<unknown>) | null>(null)
  const registerChat = useCallback<RegisterChat>((target, run) => {
    chatRun.current = run ?? null
    setChatTarget((prev) => (prev?.key === target?.key && prev?.title === target?.title ? prev : target))
  }, [])
  const isPush = channel === 'push'
  // リンク先の場所(メイン画像・ボタン)。メールは URL、アプリは開く画面を決める
  const slots = linkSlots(template, items, props.products, props.campaign, form.country)
  const pr = progressOf({
    theme,
    template,
    heroId: heroId,
    headline,
    items: items,
    instructions,
    links: linksComplete(slots, links, isPush ? { tapDone: tapComplete(pushLink) } : undefined),
    push: isPush ? { title: form.pushTitle, body: form.pushBody } : undefined,
  })

  const mark = (filled: boolean, hasIdeas: boolean) => `${filled ? '✓ ' : ''}${hasIdeas ? '● ' : ''}`
  // 工程のタブ(① 〜 ⑥)。狭い幅で横にスクロールしないよう、収まらないときは、開いているタブ以外を番号だけにして、名前はマウスを重ねると出す(FLOWS の F9)
  const steps: { value: TopTab; full: string; short: string; done: boolean; ideas: boolean }[] = [
    { value: 'theme', full: t('① テーマ', '1. Theme'), short: t('①', '1'), done: pr.theme, ideas: drafts.themeIdeas.length > 0 },
    { value: 'template', full: t('② テンプレート', '2. Template'), short: t('②', '2'), done: pr.template, ideas: false },
    ...(isPush
      ? [
          { value: 'notice' as TopTab, full: t('③ 通知', '3. Notification'), short: t('③', '3'), done: pr.hero, ideas: drafts.pushIdeas.length > 0 },
          { value: 'message' as TopTab, full: t('④ メッセージ', '4. Message'), short: t('④', '4'), done: pr.sections, ideas: drafts.copyIdeas.length > 0 },
          { value: 'links' as TopTab, full: t('⑤ リンク先', '5. Links'), short: t('⑤', '5'), done: pr.links, ideas: false },
        ]
      : [
          { value: 'hero' as TopTab, full: t('③ ヒーロー', '3. Hero'), short: t('③', '3'), done: pr.hero, ideas: drafts.copyIdeas.length > 0 },
          { value: 'sections' as TopTab, full: t('④ セクション', '4. Sections'), short: t('④', '4'), done: pr.sections, ideas: false },
          { value: 'links' as TopTab, full: t('⑤ リンク先', '5. Links'), short: t('⑤', '5'), done: pr.links, ideas: false },
          { value: 'instructions' as TopTab, full: t('⑥ 制作指示', '6. Notes'), short: t('⑥', '6'), done: pr.instructions, ideas: drafts.instructionIdeas.length > 0 },
        ]),
  ]
  // タブの列が幅に収まらなければ番号だけ(compact)にする。収まる幅に戻ったら、名前つきに戻す(名前つきのときの幅を覚えておく)
  const tabListRef = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)
  const fullTabsWidth = useRef(0)
  useEffect(() => {
    const el = tabListRef.current
    if (!el) return
    const check = () => {
      if (!compact) {
        if (el.scrollWidth > el.clientWidth + 1) {
          fullTabsWidth.current = el.scrollWidth
          setCompact(true)
        }
      } else if (fullTabsWidth.current > 0 && el.clientWidth >= fullTabsWidth.current) {
        setCompact(false)
      }
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [compact, isPush])
  const needTheme = theme.trim() ? undefined : t('先にテーマを決めてください', 'Set a theme first')

  // テーマ・テンプレート・制作指示のタブの対象(ヒーロー・セクションは、各タブ(HeroTab・SectionsTab)が知らせる)
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (tab === 'theme') registerChat({ key: 'theme', title: t('テーマ', 'Theme') }, () => drafts.runTheme())
    else if (tab === 'instructions') registerChat({ key: 'instructions', title: t('制作指示', 'Production notes') }, () => drafts.runInstructions())
    else if (tab === 'notice') registerChat({ key: 'push', title: t('通知', 'Notification') }, () => drafts.runPush())
    else if (tab === 'template' || tab === 'links' || tab === 'timing' || tab === 'message') registerChat(null)
    /* eslint-enable react-hooks/set-state-in-effect */
  })

  const sendChat = async (text: string) => {
    const run = chatRun.current
    if (!chatTarget || !run || chatBusy) return
    const key = chatTarget.key
    const turns: ChatMsg[] = [...(chats[key] ?? []), { role: 'user', text }]
    setChats((prev) => ({ ...prev, [key]: turns }))
    setChatBusy(true)
    let reply = ''
    try {
      const out = await withChat(turns, () => run())
      reply = out.answered
        ? out.reply || tr('(回答がありませんでした)', '(No answer)')
        : out.value === true
          ? out.reply || tr('反映しました', 'Done.')
          : tr('うまくいきませんでした。画面下のメッセージを確認してください', "That didn't work. Check the message at the bottom of the screen.")
    } catch (e) {
      reply = e instanceof Error ? e.message : String(e)
    } finally {
      setChatBusy(false)
    }
    setChats((prev) => ({ ...prev, [key]: [...turns, { role: 'assistant', text: reply }] }))
  }

  const suggestions = chatSuggestions(chatTarget?.key)

  return (
    <div className={s.shell}>
    <div className={s.head}>
      <TabList ref={tabListRef} size="small" className={s.tabs} selectedValue={tab} onTabSelect={(_, d) => openTab(d.value as TopTab)}>
        {steps.map((st) => {
            const tabEl = (
              <Tab key={st.value} value={st.value} onClick={revealTab} aria-label={compact ? st.full : undefined}>
                {/* 番号だけのときも、開いているタブは名前を出す(どこにいるかが分かるように) */}
                {`${mark(st.done, st.ideas)}${compact && tab !== st.value ? st.short : st.full}`}
              </Tab>
            )
            // 番号だけのときは、名前をマウスを重ねる(キーボードで選ぶ)と出す
            return compact ? (
              <Tooltip key={st.value} content={st.full} relationship="description">
                {tabEl}
              </Tooltip>
            ) : (
              tabEl
            )
          })}
      </TabList>
    </div>
    <div className={s.scroll}>
    <div className={s.grid12}>

      {tab === 'theme' && (
        <IdeaTab
          label={t('テーマ(配信全体の前提。メールには出ません)', 'Theme (premise for the whole delivery. Not shown in the email)')}
          value={theme}
          onChange={(v) => {
            onField('theme', v)
            onField('themeReason', '')
          }}
          ideas={drafts.themeIdeas.map((th) => ({ text: th.theme, note: th.reason }))}
          savedNote={form.themeReason}
          onAdopt={(idea) => {
            onField('theme', idea.text)
            onField('themeReason', idea.note ?? '')
          }}
          busy={!!drafts.busy.theme}
          onGenerate={drafts.runTheme}
        />
      )}
      {tab === 'template' && <TemplateTab template={template} onTemplate={onTemplate} hasCandidates={candidates.length > 0} channel={channel} country={form.country} use={props.templateUse} />}
      {tab === 'notice' && (
        <CopyTab
          push
          headline={form.pushTitle}
          lead={form.pushBody}
          onHeadline={(v) => onField('pushTitle', v)}
          onLead={(v) => onField('pushBody', v)}
          ideas={drafts.pushIdeas}
          onAdopt={(idea) => {
            onField('pushTitle', idea.headline)
            onField('pushBody', idea.lead)
          }}
          busy={!!drafts.busy.push}
          blocked={needTheme}
          onGenerate={drafts.runPush}
        />
      )}
      {tab === 'message' && (
        <>
          <span className={s.caption}>
            {t('通知を押すと、アプリの中で開くメッセージです。メールと同じ部品(メイン画像・見出し・セクション)で組みます。', 'The message opened in the app when the notification is tapped. It uses the same parts as an email (main image, headline, sections).')}
          </span>
          <HeroTab editor={props.editor} drafts={drafts} heroes={props.heroes} registerChat={registerChat} subjectAbKey={subjectAbKey} onUploadHero={props.onUploadHero} />
          {sectionsOf(template).length > 0 && <SectionsTab editor={props.editor} drafts={drafts} products={props.products} registerChat={registerChat} alertKinds={props.alertKinds} onAlert={props.onAlert} onOpenProduct={props.onOpenProduct} />}
        </>
      )}
      {tab === 'hero' && <HeroTab editor={props.editor} drafts={drafts} heroes={props.heroes} registerChat={registerChat} subjectAbKey={subjectAbKey} onUploadHero={props.onUploadHero} />}
      {tab === 'sections' && <SectionsTab editor={props.editor} drafts={drafts} products={props.products} registerChat={registerChat} alertKinds={props.alertKinds} onAlert={props.onAlert} onOpenProduct={props.onOpenProduct} />}
      {tab === 'instructions' && (
        <IdeaTab
          label={t('制作指示', 'Production notes')}
          rich
          value={instructions}
          onChange={(v) => {
            onField('instructions', v)
            onField('instructionsAngle', '')
          }}
          ideas={drafts.instructionIdeas.map((c) => ({ text: c.text, chip: c.angle }))}
          savedChip={form.instructionsAngle}
          onAdopt={(idea) => {
            onField('instructions', idea.text)
            onField('instructionsAngle', idea.chip ?? '')
          }}
          busy={!!drafts.busy.instructions}
          blocked={needTheme}
          onGenerate={drafts.runInstructions}
        />
      )}
      {/* 制作指示(文章)と参考の素材(画像・URL)は、マーケ担当が制作に伝えるひと組なので、同じタブで書いて添える(X58) */}
      {tab === 'instructions' && props.assetsSlot && <div className={s.assetsBlock}>{props.assetsSlot}</div>}
      {tab === 'links' && isPush && (
        <AppLinksEditor
          links={links}
          onLinks={setLinks}
          slots={slots}
          items={items}
          products={props.products}
          campaign={variantCampaign(props.campaign, props.linkVariant)}
          pushLink={pushLink}
          onPushLink={setPushLink}
          onFocusSlot={props.onLinkFocus}
        />
      )}
      {tab === 'links' && !isPush && (
        <LinksEditor
          links={links}
          onLinks={setLinks}
          slots={slots}
          template={template}
          items={items}
          products={props.products}
          campaign={props.utmCampaign}
          variant={props.linkVariant}
          onFocusSlot={props.onLinkFocus}
        />
      )}
    </div>
    </div>
    <ChatPanel
      title={chatTarget?.title ?? null}
      messages={chatTarget ? (chats[chatTarget.key] ?? []) : []}
      busy={chatBusy}
      suggestions={suggestions}
      idleHint={t('このタブは、AIチャットの対象ではありません。テーマ・ヒーロー・セクション・制作指示のタブで使えます', 'This tab is not an AI chat target. Use it on the Theme, Hero, Sections, or Production notes tab.')}
      onSend={(text) => void sendChat(text)}
      onClear={() => chatTarget && setChats((prev) => ({ ...prev, [chatTarget.key]: [] }))}
    />
    </div>
  )
}
