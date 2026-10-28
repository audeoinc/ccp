// 「？ 聞く」のフロートの最初の画面に出す、よく聞かれる質問(X82 段 ④)。回数の多い順に、聞き方を並べる。
// 押すと、AI に聞き直さずに、まとめたときに作った答えを、ふつうの答えと同じ形(HelpTurn)で渡す(フロートが答えとして並べる)。
// 答えの分からなかった FAQ・隠した FAQ は出さない。フロートの側は <HelpFaqList onPick={…} /> を置くだけでよい
import { useEffect, useState } from 'react'
import { Button, makeStyles, tokens } from '@fluentui/react-components'
import { HelpService } from '../data/help'
import type { HelpFaq } from '../models/helpFaqs'
import { useLang, useT } from '../i18n'
import { faqAnswer, faqQuestion, onFaqsChanged } from './faq'
import type { HelpTurn } from './helpAsk'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '6px' },
  head: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold },
  list: { display: 'grid', rowGap: '2px' },
  item: { justifyContent: 'flex-start', textAlign: 'left', fontWeight: tokens.fontWeightRegular },
})

/** 出す数(多すぎると最初の画面が長くなるので、回数の多いものから) */
const SHOW = 6

export function HelpFaqList({ onPick, max = SHOW }: { onPick: (turn: HelpTurn) => void; max?: number }) {
  const s = useStyles()
  const t = useT()
  const lang = useLang()
  const [faqs, setFaqs] = useState<HelpFaq[]>([])
  useEffect(() => {
    let alive = true
    const load = () =>
      void HelpService.faqs().then(
        (rows) => alive && setFaqs(rows),
        () => {},
      )
    load()
    const off = onFaqsChanged(load)
    return () => {
      alive = false
      off()
    }
  }, [])
  const shown = faqs
    .map((f) => ({ f, answer: faqAnswer(f, lang) }))
    .filter((x): x is { f: HelpFaq; answer: NonNullable<ReturnType<typeof faqAnswer>> } => !!x.answer?.known)
    .slice(0, max)
  if (shown.length === 0) return null
  return (
    <div className={s.root}>
      <span className={s.head}>{t('よく聞かれる質問', 'Frequently asked')}</span>
      <div className={s.list}>
        {shown.map(({ f, answer }) => (
          <Button key={f.id} size="small" appearance="subtle" className={s.item} onClick={() => onPick({ question: faqQuestion(f, lang), answer })}>
            {faqQuestion(f, lang)}
          </Button>
        ))}
      </div>
    </div>
  )
}
