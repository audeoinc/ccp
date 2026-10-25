import { useState } from 'react'
import { Button, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AddRegular, BoxMultipleArrowRightRegular, DismissRegular } from '@fluentui/react-icons'
import { AutoTextarea } from '../AutoTextarea'
import { ListHeader } from '../ListHeader'
import { useJustAdded } from '../useJustAdded'
import { useT } from '../i18n'
import type { SimpleEditor } from './editor'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '6px', paddingTop: '10px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
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
  const justAdded = useJustAdded()
  // 制作指示の中の並びは変えない。見せるときだけ、足した行を上に出す
  const mine = justAdded.order(lines.map((l, i) => ({ l, i })).filter((x) => x.l.startsWith(prefix)), (x) => x.l)
  const add = () => {
    const v = text.trim().replace(/\n+/g, ' ')
    if (!v) return
    const base = e.form.instructions.replace(/\s+$/, '')
    e.setField('instructions', `${base ? `${base}\n` : ''}${prefix}${v}`)
    setText('')
    setWriting(false)
    // 足した行は、この画面を開いている間だけ上に出し、少しのあいだ印を付ける(画面の部品の決まり 1)
    justAdded.mark(`${prefix}${v}`)
  }
  const remove = (index: number) => e.setField('instructions', lines.filter((_, i) => i !== index).join('\n'))
  return (
    <div className={s.root}>
      {/* 見出しの右に「＋ メモを足す」、書く欄は一覧の上に開く(ListHeader。画面の部品の決まり 1) */}
      <ListHeader title={t('制作へのメモ(渡すものに入ります)', 'Note for production (goes to Handoff)')} icon={<BoxMultipleArrowRightRegular />} count={mine.length} addLabel={t('メモを足す', 'Add a note')} onAdd={() => setWriting(true)} addDisabled={writing} />
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
      {mine.map((x) => (
        <span key={x.i} className={mergeClasses(s.line, justAdded.freshClass(x.l))}>
          <span>{x.l.slice(prefix.length)}</span>
          <Button size="small" appearance="subtle" icon={<DismissRegular />} onClick={() => remove(x.i)} aria-label={t('このメモを外す', 'Remove this note')} />
        </span>
      ))}
    </div>
  )
}
