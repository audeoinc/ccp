// 設定の画面の「開発・管理」→「「？ 聞く」のよく聞かれる質問」(X82 段 ④)。
// AI がまとめたよく聞かれる質問を、回数・「開発に伝える」に進んだ数の多い順に見る(画面の分かりにくい所の手がかり)。
// まちがった FAQ を隠す・戻す、まとめ直す、質問の生の記録を見る。人は FAQ を選ばない(AI が作り、外せるだけ。2026-10-26 利用者)
import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, MessageBar, MessageBarBody, Spinner, Tab, TabList, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowSyncRegular, EyeOffRegular, EyeRegular } from '@fluentui/react-icons'
import { HelpService, type HelpFaqAdminInfo } from '../data/help'
import type { HelpFaq } from '../models/helpFaqs'
import type { HelpQuestion } from '../models/helpQuestions'
import { LabeledValue } from '../LabeledValue'
import { typo } from '../typo'
import { day, useLang, useT, when } from '../i18n'
import { buildFaqs, faqAnswer, faqQuestion, onFaqsChanged } from './faq'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '12px', minWidth: 0 },
  bar: { display: 'flex', alignItems: 'center', columnGap: '16px', rowGap: '6px', flexWrap: 'wrap' },
  grow: { flexGrow: 1 },
  note: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  list: { display: 'grid', rowGap: '8px' },
  row: { display: 'grid', rowGap: '6px', padding: '10px 12px', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium },
  hidden: { opacity: 0.55 },
  head: { display: 'flex', alignItems: 'flex-start', columnGap: '8px' },
  question: { ...typo.heading, flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere' },
  meta: { display: 'flex', columnGap: '16px', rowGap: '4px', flexWrap: 'wrap' },
  answer: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2, paddingLeft: '10px', borderLeft: `2px solid ${tokens.colorNeutralStroke2}`, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  builds: { margin: 0, paddingLeft: '18px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  error: { color: tokens.colorPaletteRedForeground1 },
})

type Sort = 'count' | 'dev'

/** 関係する画面の短い文(多い順に 3 つまで) */
function placesText(json?: string): string {
  try {
    const rows = JSON.parse(json ?? '[]') as { page?: string; view?: string; open?: string; el?: string; count?: number }[]
    return rows
      .slice(0, 3)
      .map((r) => `${[r.page, r.view, r.open, r.el].filter(Boolean).join(' / ')}(${r.count ?? 1})`)
      .join('、')
  } catch {
    return ''
  }
}

export function HelpFaqAdmin() {
  const s = useStyles()
  const t = useT()
  const lang = useLang()
  const [tab, setTab] = useState<'faqs' | 'questions'>('faqs')
  const [sort, setSort] = useState<Sort>('count')
  const [data, setData] = useState<({ faqs: HelpFaq[] } & HelpFaqAdminInfo) | null>(null)
  const [questions, setQuestions] = useState<HelpQuestion[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ intent: 'success' | 'error' | 'info'; text: string } | null>(null)

  const load = useCallback(
    () =>
      HelpService.adminFaqs().then(setData, (e: unknown) => setMessage({ intent: 'error', text: e instanceof Error ? e.message : String(e) })),
    [],
  )
  useEffect(() => {
    void load()
    return onFaqsChanged(() => void load())
  }, [load])
  useEffect(() => {
    if (tab === 'questions' && questions === null) void HelpService.questions().then(setQuestions, () => setQuestions([]))
  }, [tab, questions])

  const rebuild = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const n = await buildFaqs()
      setMessage(n > 0 ? { intent: 'success', text: t(`まとめ直しました(${n} 件の FAQ を足した・直した)`, `Rebuilt (${n} FAQs added or updated)`) } : { intent: 'info', text: t('まとめる新しい質問がないか、ほかの画面がまとめています', 'No new questions to group, or another screen is rebuilding') })
    } catch (e) {
      setMessage({ intent: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
      void load()
    }
  }
  const toggleHidden = async (f: HelpFaq) => {
    await HelpService.setHidden(f.id, !f.hidden_at).catch((e) => setMessage({ intent: 'error', text: e instanceof Error ? e.message : String(e) }))
    void load()
  }

  const faqs = [...(data?.faqs ?? [])].sort((a, b) => (sort === 'dev' ? (b.dev_count ?? 0) - (a.dev_count ?? 0) : 0) || (b.ask_count ?? 0) - (a.ask_count ?? 0))
  const statusText = (v?: string) => (v === 'running' ? t('まとめています', 'Running') : v === 'error' ? t('失敗', 'Failed') : t('済み', 'Done'))

  return (
    <div className={s.root}>
      <span className={s.note}>
        {t(
          '「？ 聞く」で聞かれた質問を、AI が同じ意味ごとに束ねたものです。新しい質問が決まった数たまると、聞いた人の画面が裏でまとめ直します。だれが聞いたかは残しません。質問の生の記録は、まとめに入れてから決まった日数で消えます。まちがった FAQ は隠せます(「？ 聞く」に出なくなります)。',
          'Questions asked in Help, grouped by meaning by AI. When enough new questions pile up, the asker’s screen rebuilds them in the background. Who asked is not kept. Raw questions are deleted a set number of days after being grouped. Hide wrong FAQs to keep them out of Help.',
        )}
      </span>
      {message && (
        <MessageBar intent={message.intent} layout="multiline">
          <MessageBarBody>{message.text}</MessageBarBody>
        </MessageBar>
      )}
      <div className={s.bar}>
        <LabeledValue label={t('まだまとめていない質問', 'Not grouped yet')}>{data ? `${data.pending} / ${data.threshold}` : ''}</LabeledValue>
        <LabeledValue label={t('質問の記録', 'Questions kept')}>{data ? String(data.questions) : ''}</LabeledValue>
        <LabeledValue label={t('記録を残す日数', 'Days kept after grouping')}>{data ? String(data.retainDays) : ''}</LabeledValue>
        <LabeledValue label={t('最後にまとめた日時', 'Last rebuilt')}>{when(data?.builds.find((b) => b.status === 'done')?.finished_at)}</LabeledValue>
        <span className={s.grow} />
        <Button icon={busy ? <Spinner size="extra-tiny" /> : <ArrowSyncRegular />} disabled={busy || !data?.pending} onClick={() => void rebuild()}>
          {t('いままとめ直す', 'Rebuild now')}
        </Button>
      </div>
      {!!data?.builds.length && (
        <ul className={s.builds}>
          {data.builds.map((b) => (
            <li key={b.id} className={mergeClasses(b.status === 'error' && s.error)}>
              {when(b.created_on)} {statusText(b.status)} · {t(`質問 ${b.question_count ?? 0} 件 → FAQ ${b.faq_count ?? 0} 件`, `${b.question_count ?? 0} questions → ${b.faq_count ?? 0} FAQs`)}
              {b.error ? ` · ${b.error}` : ''}
            </li>
          ))}
        </ul>
      )}
      <TabList size="small" selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as typeof tab)}>
        <Tab value="faqs">{t(`よく聞かれる質問(${data?.faqs.length ?? 0})`, `FAQs (${data?.faqs.length ?? 0})`)}</Tab>
        <Tab value="questions">{t('質問の記録', 'Question log')}</Tab>
      </TabList>
      {tab === 'faqs' ? (
        <>
          {/* 回数が多い・「開発に伝える」に進んだことが多い質問は、画面の分かりにくい所の手がかり(要件) */}
          <TabList size="small" appearance="subtle" selectedValue={sort} onTabSelect={(_, d) => setSort(d.value as Sort)}>
            <Tab value="count">{t('聞かれた回数の多い順', 'Most asked')}</Tab>
            <Tab value="dev">{t('「開発に伝える」の多い順', 'Most sent to developers')}</Tab>
          </TabList>
          {data === null ? (
            <Spinner size="small" />
          ) : faqs.length === 0 ? (
            <span className={s.note}>{t('まだありません', 'None yet')}</span>
          ) : (
            <div className={s.list}>
              {faqs.map((f) => {
                const a = faqAnswer(f, lang)
                return (
                  <div key={f.id} className={mergeClasses(s.row, f.hidden_at && s.hidden)}>
                    <div className={s.head}>
                      <span className={s.question}>{faqQuestion(f, lang)}</span>
                      {f.hidden_at && <Badge appearance="tint" color="subtle">{t('隠している', 'Hidden')}</Badge>}
                      {a && !a.known && <Badge appearance="tint" color="warning">{t('答えが分からない', 'No answer')}</Badge>}
                      <Button size="small" appearance="subtle" icon={f.hidden_at ? <EyeRegular /> : <EyeOffRegular />} onClick={() => void toggleHidden(f)}>
                        {f.hidden_at ? t('出す', 'Show') : t('隠す', 'Hide')}
                      </Button>
                    </div>
                    <div className={s.meta}>
                      <LabeledValue label={t('回数', 'Asked')}>{String(f.ask_count ?? 0)}</LabeledValue>
                      <LabeledValue label={t('開発に伝えた', 'Sent to devs')}>{String(f.dev_count ?? 0)}</LabeledValue>
                      <LabeledValue label={t('最初', 'First')}>{day(f.first_asked_at)}</LabeledValue>
                      <LabeledValue label={t('最後', 'Last')}>{day(f.last_asked_at)}</LabeledValue>
                      <LabeledValue label={t('画面', 'Screens')} truncate>
                        {placesText(f.places)}
                      </LabeledValue>
                    </div>
                    {a && <div className={s.answer}>{[a.reply, ...a.steps.map((x, i) => `${i + 1}. ${x}`)].filter(Boolean).join('\n').replace(/\[\[(.+?)\]\]/g, '「$1」')}</div>}
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : questions === null ? (
        <Spinner size="small" />
      ) : questions.length === 0 ? (
        <span className={s.note}>{t('まだありません', 'None yet')}</span>
      ) : (
        <div className={s.list}>
          {questions.map((q) => (
            <div key={q.id} className={s.row}>
              <span className={s.question}>{q.question}</span>
              <div className={s.meta}>
                <LabeledValue label={t('聞いた日時', 'Asked')}>{when(q.asked_at ?? q.created_on)}</LabeledValue>
                <LabeledValue label={t('言葉', 'Language')}>{q.lang}</LabeledValue>
                <LabeledValue label={t('部品', 'Part')}>{q.element_label || q.element}</LabeledValue>
                <LabeledValue label={t('開発に伝えた', 'Sent to devs')}>{q.sent_to_dev_at ? when(q.sent_to_dev_at) : ''}</LabeledValue>
                <LabeledValue label={t('まとめた日時', 'Grouped')}>{when(q.summarized_at)}</LabeledValue>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
