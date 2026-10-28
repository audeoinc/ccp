// 編集中の右のタブ「テンプレート」の「似ているテンプレート」の欄(2026-10-28 利用者の指示。前は左の細い帯の一覧で、押しても見取り図が大きく出るだけだった)。
// ねらい: ほかと比べて、似ているものを参考にする(見比べる・セクションを取り込む)、似ているものを直す・複製する、同じ構成があれば作り過ぎを避ける
import { useState } from 'react'
import { Button, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, MessageBar, MessageBarActions, MessageBarBody, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowImportRegular, CopyRegular, MoreHorizontalRegular, OpenRegular, SplitVerticalRegular } from '@fluentui/react-icons'
import { ListHeader } from './ListHeader'
import { LabeledValue } from './LabeledValue'
import { TemplateThumb } from './TemplateThumb'
import { toTableLayout } from './tables'
import { VERY_SIMILAR, sectionTitle } from './templateShape'
import { typo } from './typo'
import { useT } from './i18n'
import type { Section, TemplateLayout } from './templates'

/** 最初に出す行の数(残りは「もっと見る」) */
const FIRST = 4

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '8px', minWidth: 0 },
  row: { display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr)', columnGap: '8px', alignItems: 'start', padding: '6px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}` },
  // 同じ構成の行は、知らせと同じ色の縁で、どれのことか分かるように
  rowSame: { border: `1px solid ${tokens.colorPaletteYellowBorder2}` },
  text: { display: 'grid', rowGap: '4px', minWidth: 0 },
  name: { ...typo.valueStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  actions: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px', marginLeft: '-6px' },
  empty: typo.caption,
})

export interface SimilarEntry<T extends TemplateLayout & { id: string; label: string }> {
  o: T
  same: boolean
  score: number
}

/** 相手のセクションを選んで取り込むメニュー(行と、見比べるフロートの両方で使う) */
export function ImportSectionMenu({ layout, onImport, size = 'small' }: { layout: TemplateLayout; onImport: (sec: Section) => void; size?: 'small' | 'medium' }) {
  const t = useT()
  const sections = toTableLayout(layout).sections
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button size={size} appearance="subtle" icon={<ArrowImportRegular />} disabled={sections.length === 0}>
          {t('セクションを取り込む', 'Import a section')}
        </Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {sections.map((sec, i) => (
            <MenuItem key={sec.id ?? i} onClick={() => onImport(sec)}>
              {sectionTitle(sec, i, t)}
            </MenuItem>
          ))}
        </MenuList>
      </MenuPopover>
    </Menu>
  )
}

interface Props<T extends TemplateLayout & { id: string; label: string }> {
  entries: SimilarEntry<T>[]
  onCompare: (id: string) => void
  onImport: (id: string, sec: Section) => void
  onOpen: (id: string) => void
  onDuplicate: (id: string) => void
}

/** 似ているテンプレート(同じ構成を先に、あとは似ている順)。いちばん上に、同じ構成・よく似たものの知らせ */
export function SimilarTemplates<T extends TemplateLayout & { id: string; label: string }>({ entries, onCompare, onImport, onOpen, onDuplicate }: Props<T>) {
  const s = useStyles()
  const t = useT()
  const [all, setAll] = useState(false)
  const same = entries.find((x) => x.same)
  const close = !same ? entries.find((x) => x.score >= VERY_SIMILAR) : undefined
  // 最初は、少しでも似ているものだけ(似ている度 0% は「もっと見る」の中。セクションを取り込む相手としては使えるので、消さない)
  const first = entries.filter((x) => x.same || x.score > 0).slice(0, FIRST)
  const shown = all ? entries : first
  const pct = (x: SimilarEntry<T>) => (x.same ? t('同じ構成', 'Same layout') : `${Math.round(x.score * 100)}%`)
  return (
    <div className={s.root}>
      <ListHeader title={t('似ているテンプレート', 'Similar templates')} caption={t('似ている順。見比べて、参考にする・取り込む・そちらを直すに使えます', 'Most similar first. Compare, import from, or edit them instead')} />
      {/* 作り過ぎを避ける: 同じ構成(見た目の設定のほかは同じ)か、よく似たものがあれば、先に知らせる */}
      {(same ?? close) && (
        <MessageBar intent={same ? 'warning' : 'info'} layout="multiline">
          <MessageBarBody>
            {same
              ? t(`同じ構成のテンプレート「${same.o.label}」があります。新しく作る前に、そちらを使うか、直すことも考えてください。`, `"${same.o.label}" has the same layout. Consider using or editing it instead of creating a new one.`)
              : t(`よく似たテンプレート「${close!.o.label}」があります(似ている度 ${Math.round(close!.score * 100)}%)。`, `"${close!.o.label}" is very similar (${Math.round(close!.score * 100)}%).`)}
          </MessageBarBody>
          <MessageBarActions>
            <Button size="small" onClick={() => onCompare((same ?? close)!.o.id)}>
              {t('見比べる', 'Compare')}
            </Button>
          </MessageBarActions>
        </MessageBar>
      )}
      {entries.length === 0 && <span className={s.empty}>{t('比べるテンプレートがありません', 'No templates to compare')}</span>}
      {shown.map((x) => (
        <div key={x.o.id} className={mergeClasses(s.row, x.same && s.rowSame)} data-similar-id={x.o.id}>
          <TemplateThumb layout={x.o} width={48} maxHeight={72} />
          <div className={s.text}>
            <span className={s.name} title={x.o.label}>
              {x.o.label}
            </span>
            <LabeledValue label={t('似ている度', 'Similarity')}>{pct(x)}</LabeledValue>
            <div className={s.actions}>
              <Button size="small" appearance="subtle" icon={<SplitVerticalRegular />} onClick={() => onCompare(x.o.id)}>
                {t('見比べる', 'Compare')}
              </Button>
              <ImportSectionMenu layout={x.o} onImport={(sec) => onImport(x.o.id, sec)} />
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Tooltip relationship="label" content={t('ほかの操作', 'More actions')}>
                    <Button size="small" appearance="subtle" icon={<MoreHorizontalRegular />} />
                  </Tooltip>
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    <MenuItem icon={<OpenRegular />} onClick={() => onOpen(x.o.id)}>
                      {t('開く', 'Open')}
                    </MenuItem>
                    <MenuItem icon={<CopyRegular />} onClick={() => onDuplicate(x.o.id)}>
                      {t('複製して直す', 'Duplicate and edit')}
                    </MenuItem>
                  </MenuList>
                </MenuPopover>
              </Menu>
            </div>
          </div>
        </div>
      ))}
      {entries.length > first.length && (
        <Button size="small" appearance="subtle" onClick={() => setAll((v) => !v)}>
          {all ? t('たたむ', 'Show less') : t(`もっと見る(あと ${entries.length - first.length})`, `Show ${entries.length - first.length} more`)}
        </Button>
      )}
    </div>
  )
}
