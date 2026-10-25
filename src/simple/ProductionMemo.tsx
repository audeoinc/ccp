import { useState } from 'react'
import { Button, makeStyles, tokens } from '@fluentui/react-components'
import { AddRegular, BoxMultipleArrowRightRegular, DismissRegular } from '@fluentui/react-icons'
import { AutoTextarea } from '../AutoTextarea'
import { useT } from '../i18n'
import type { SimpleEditor } from './editor'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '6px', paddingTop: '10px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  head: { display: 'flex', alignItems: 'center', columnGap: '6px', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground2 },
  line: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: '4px', fontSize: tokens.fontSizeBase200, padding: '2px 6px', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground2 },
  input: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: '6px', alignItems: 'end' },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
})

/** 制作指示の 1 行の頭(部品の名前)。この部品のメモを見分けるのにも使う */
const prefixOf = (label: string) => `・${label}: `

/**
 * 制作へのメモ(SU1。2026-10-23 利用者と決めた: PLAN の途中で「ここはこういうイメージ」と思ったら、その場で書き留めたい)。
 * 選んだ部品のペインの下から 1 行書くと、渡すもの(制作指示)に「・メイン画像: 人物を大きく」の形で足す。渡すものの列を開かなくてよい。
 * 足した行は、この部品の分だけ下に並べ、ここからも外せる(制作指示の文章そのものは、渡すもので直す)
 */
export function ProductionMemo({ editor: e, label }: { editor: SimpleEditor; label: string }) {
  const t = useT()
  const s = useStyles()
  const [text, setText] = useState('')
  // 書く欄を開いているか(ふだんは「＋ 制作へのメモ」の 1 行。部品のペインを短くするため。レビューの 11)
  const [writing, setWriting] = useState(false)
  const prefix = prefixOf(label)
  const lines = e.form.instructions.split('\n')
  const mine = lines.map((l, i) => ({ l, i })).filter((x) => x.l.startsWith(prefix))
  const add = () => {
    const v = text.trim().replace(/\n+/g, ' ')
    if (!v) return
    const base = e.form.instructions.replace(/\s+$/, '')
    e.setField('instructions', `${base ? `${base}\n` : ''}${prefix}${v}`)
    setText('')
    setWriting(false)
  }
  const remove = (index: number) => e.setField('instructions', lines.filter((_, i) => i !== index).join('\n'))
  return (
    <div className={s.root}>
      {writing ? (
        <span className={s.head}>
          <BoxMultipleArrowRightRegular />
          {t('制作へのメモ(渡すものに入ります)', 'Note for production (goes to Handoff)')}
        </span>
      ) : (
        <span>
          <Button size="small" appearance="subtle" icon={<AddRegular />} onClick={() => setWriting(true)}>
            {t('制作へのメモ', 'Note for production')}
          </Button>
        </span>
      )}
      {mine.map((x) => (
        <span key={x.i} className={s.line}>
          <span>{x.l.slice(prefix.length)}</span>
          <Button size="small" appearance="subtle" icon={<DismissRegular />} onClick={() => remove(x.i)} aria-label={t('このメモを外す', 'Remove this note')} />
        </span>
      ))}
      {writing && (
      <div className={s.input}>
        <AutoTextarea heightKey="ProductionMemo.text"
          autoFocus
          size="small"
          rows={1}
          value={text}
          placeholder={t('例: 人物を大きく、背景は明るめに', 'e.g. Feature the model large, bright background')}
          onChange={(_, d) => setText(d.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' && !ev.shiftKey && !ev.nativeEvent.isComposing) {
              ev.preventDefault()
              add()
            }
          }}
        />
        <Button size="small" icon={<AddRegular />} disabled={!text.trim()} onClick={add} aria-label={t('メモを足す', 'Add the note')} />
      </div>
      )}
    </div>
  )
}
