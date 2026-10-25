// 中ペイン(ContentPane・HeroTab・SectionsTab)で共通の部品(整理 第3段 ③)
import { type ReactNode } from 'react'
import { Accordion, AccordionHeader, AccordionItem, AccordionPanel, Badge, Button, Field, MessageBar, MessageBarActions, MessageBarBody, mergeClasses } from '@fluentui/react-components'
import {
  ChevronDownRegular,
  DismissRegular,
} from '@fluentui/react-icons'
import { AutoTextarea } from './AutoTextarea'
import { useT } from './i18n'
import { AiButton } from './AiButton'
import { PUSH_BODY_MAX, PUSH_TITLE_MAX } from './pushLink'
import { useContentPaneStyles } from './contentPaneStyles'
import { PREHEADER_MAX, SUBJECT_MAX } from './textLimits'

/**
 * セクションの中の 1 つのブロック(見出し / コピー / 商品)。右上に、そのブロックの AI ボタンなどを置く。
 * 見出しの行を押すと、中身を折りたたむ(商品の一覧が長いとき、他のブロックを見やすくするため)。折りたたみ中は、summary を 1 行で出す
 */
export function Block({ title, right, children, open = true, onToggle, summary }: { title: string; right?: ReactNode; children: ReactNode; open?: boolean; onToggle?: () => void; summary?: string }) {
  const s = useContentPaneStyles()
  const t = useT()
  if (!onToggle)
    return (
      <div className={s.block}>
        <span className={s.bold}>{title}</span>
        {right && <div className={s.flexRow}>{right}</div>}
        {children}
      </div>
    )
  // 開閉は親が覚える(open・onToggle)。Fluent の Accordion を、その値で開け閉めする
  return (
    <Accordion collapsible openItems={open ? ['block'] : []} onToggle={onToggle} className={s.block} style={{ display: 'block' }}>
      <AccordionItem value="block">
        <AccordionHeader size="small" className={s.blockHeader} button={{ title: open ? t('折りたたむ', 'Collapse') : t('開く', 'Expand') }}>
          <span className={s.bold}>{title}</span>
          {!open && summary && <span className={s.blockSummary}>{` — ${summary}`}</span>}
        </AccordionHeader>
        <AccordionPanel className={s.blockPanel}>
          {right && <div className={s.flexRow}>{right}</div>}
          {children}
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  )
}

// ------------------------------------------------------------------ ヘッドライン + コピー: 案 → 採用

export function CopyTab(props: {
  headline: string
  lead: string
  onHeadline: (v: string) => void
  onLead: (v: string) => void
  ideas: { headline: string; lead: string; angle: string }[]
  /** 保存済みの、採用した案の切り口 */
  savedAngle?: string
  onAdopt: (idea: { headline: string; lead: string; angle: string }) => void
  busy: boolean
  blocked?: string
  onGenerate: () => void
  /** アプリ(プッシュ通知)の文面: ヘッドライン = 通知のタイトル、コピー = 本文。文字数の目安を出す */
  push?: boolean
  /** メールの件名・プリヘッダー: ヘッドライン = 件名、コピー = プリヘッダー(X2) */
  subject?: { deliveryName: string; abKey?: string }
}) {
  const s = useContentPaneStyles()
  const t = useT()
  const { headline, lead, onHeadline, onLead, ideas, savedAngle, onAdopt, busy, blocked, onGenerate, push, subject } = props
  // 通知に収まる文字数の目安(端末で切れ方が違うので、目安として出す)
  const count = (text: string, max: number) =>
    push || subject ? <span className={text.length > max ? s.warn : s.caption}>{` ${text.length} / ${max}`}</span> : null
  const firstMax = subject ? SUBJECT_MAX : PUSH_TITLE_MAX
  const secondMax = subject ? PREHEADER_MAX : PUSH_BODY_MAX
  return (
    <div className={s.grid12}>
      <div className={s.flexRow}>
        <AiButton busy={busy} disabled={!!blocked} onClick={onGenerate}>
          {ideas.length ? t('案を作り直す', 'Regenerate ideas') : subject ? t('AIで件名の案を出す', 'Suggest subjects with AI') : t('AIで案を出す', 'Suggest with AI')}
        </AiButton>
        {subject?.abKey && <span className={s.caption}>{t(`${subject.abKey} 案: A 案と違う切り口の件名を出します`, `Variant ${subject.abKey}: ideas with a different angle from A`)}</span>}
        {blocked && <span className={s.warn}>{blocked}</span>}
      </div>
      <div className={s.group}>
      <Field
        label={
          <span className={s.flexRowTight}>
            {subject
              ? t(`件名(空なら配信名「${subject.deliveryName}」)`, `Subject (empty uses the delivery name "${subject.deliveryName}")`)
              : push
                ? t('通知のタイトル', 'Notification title')
                : t('現在のヘッドライン(メイン画像に載ります)', 'Current headline (shown on the main image)')}
            <Badge size="small" appearance="filled" color="success">{t('採用中', 'In use')}</Badge>
            {count(headline, firstMax)}
          </span>
        }
        size="small"
      >
        <AutoTextarea heightKey="ContentPane.headline" rows={1} value={headline} onChange={(_, d) => onHeadline(d.value)} placeholder={subject?.deliveryName} />
      </Field>
      <Field
        label={
          <span className={s.flexRowTight}>
            {subject
              ? t('プリヘッダー(受信一覧で件名の横・下に出る短い文。目安 40〜90 文字)', 'Preheader (short text next to or under the subject in the inbox; aim for 40–90 chars)')
              : push
                ? t('通知の本文', 'Notification body')
                : t('現在のコピー(ヘッドラインの下に入ります)', 'Current copy (placed below the headline)')}
            <Badge size="small" appearance="filled" color="success">{t('採用中', 'In use')}</Badge>
            {count(lead, secondMax)}
          </span>
        }
        size="small"
      >
        <AutoTextarea heightKey="ContentPane.lead" rows={2} value={lead} onChange={(_, d) => onLead(d.value)} />
      </Field>
      {savedAngle && (headline || lead) && (
        <div className={s.noteBox}>
          <span><span className={s.lead}>{t('切り口:', 'Angle:')}</span>{` ${savedAngle}`}</span>
        </div>
      )}
      </div>
      {ideas.length > 0 && <span className={s.listHead}><span className={s.lead}>{t('AIの案(未採用):', 'AI ideas (not adopted):')}</span> {subject ? t('「採用」を押すと、件名とプリヘッダーの両方が反映されます', 'Press "Adopt" to apply both the subject and the preheader') : t('「採用」を押すと、ヘッドラインとコピーの両方が反映されます', 'Press "Adopt" to apply both the headline and the copy')}</span>}
      {ideas.map((idea) => {
        const adopted = idea.headline === headline && idea.lead === lead
        return (
          <div key={`${idea.headline}|${idea.lead}`} className={mergeClasses(s.card, adopted && s.cardAdopted)}>
            {idea.angle && <Badge className={s.chipStart} size="small" appearance="tint" color="informative">{idea.angle}</Badge>}
            <span className={s.copyHeadline}>{idea.headline}</span>
            <span className={s.caption}>{idea.lead}</span>
            <div className={s.flexEnd}>
              {adopted ? (
                <Badge size="small" appearance="filled" color="success">{t('採用中', 'In use')}</Badge>
              ) : (
                <Button
                  size="small"
                  appearance="primary"
                  onClick={() => onAdopt(idea)}
                >
                  {t('採用', 'Adopt')}
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** 「すべての…から探す」の折りたたみ */
export function Finder({ label, children }: { label: string; children: ReactNode }) {
  const s = useContentPaneStyles()
  return (
    <Accordion collapsible className={s.accordion}>
      <AccordionItem value="all">
        <AccordionHeader expandIcon={<ChevronDownRegular />} size="small">{label}</AccordionHeader>
        <AccordionPanel className={s.accordionPanel}>{children}</AccordionPanel>
      </AccordionItem>
    </Accordion>
  )
}

/** AI が選んだあとの知らせと「元に戻す」(直前の状態は、undo.run で戻す)。閉じても、戻しても、onDone */
export function UndoBar({ undo, onDone }: { undo: { message: string; run: () => void } | null; onDone: () => void }) {
  const t = useT()
  if (!undo) return null
  return (
    <MessageBar layout="multiline" intent="success">
      <MessageBarBody>{undo.message}</MessageBarBody>
      <MessageBarActions
        containerAction={<Button appearance="transparent" size="small" aria-label={t('閉じる', 'Close')} icon={<DismissRegular />} onClick={onDone} />}
      >
        <Button
          size="small"
          onClick={() => {
            undo.run()
            onDone()
          }}
        >
          {t('元に戻す', 'Undo')}
        </Button>
      </MessageBarActions>
    </MessageBar>
  )
}
