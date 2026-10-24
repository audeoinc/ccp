import { useMemo, useState } from 'react'
import { Badge, Caption1, Text, makeStyles, mergeClasses, shorthands, tokens } from '@fluentui/react-components'
import type { HeroImage } from './models/heroImages'
import { DND_HERO } from './items'
import { optionLabel, useT } from './i18n'
import { ImageThumb } from './ImageThumb'
import { heroImage } from './images'
import { FilterChips, SearchField } from './SearchField'

interface Props {
  heroes: HeroImage[]
  selectedId?: string
  onSelect: (id: string) => void
}

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '8px', minWidth: 0 },
  caption: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightRegular },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', columnGap: '8px', rowGap: '8px' },
  card: {
    position: 'relative',
    minWidth: 0,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    overflow: 'hidden',
    cursor: 'pointer',
    backgroundColor: tokens.colorNeutralBackground1,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover, ...shorthands.borderColor(tokens.colorNeutralStroke1) },
    ':focus-visible': { outline: `2px solid ${tokens.colorBrandStroke1}` },
  },
  cardUsed: {
    cursor: 'default',
    backgroundColor: tokens.colorBrandBackground2,
    ...shorthands.borderColor(tokens.colorBrandStroke1),
    ':hover': { backgroundColor: tokens.colorBrandBackground2, ...shorthands.borderColor(tokens.colorBrandStroke1) },
  },
  badge: { position: 'absolute', top: '6px', right: '6px' },
  info: { padding: '8px', minWidth: 0 },
  line: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
})

/** すべてのメイン画像から探す。サムネイルの一覧で、クリックするだけで設定できる(ドラッグ&ドロップでも設定できる) */
export function HeroCandidates({ heroes, selectedId, onSelect }: Props) {
  const t = useT()
  const styles = useStyles()
  const [query, setQuery] = useState('')
  const [purpose, setPurpose] = useState('')

  const purposes = useMemo(() => [...new Set(heroes.map((h) => h.purpose_name).filter(Boolean))] as string[], [heroes])
  const shown = heroes.filter((h) => {
    if (purpose && h.purpose_name !== purpose) return false
    const q = query.trim().toLowerCase()
    return !q || `${h.name} ${h.image_code} ${h.tags ?? ''} ${h.description ?? ''}`.toLowerCase().includes(q)
  })

  return (
    <div className={styles.root}>
      <SearchField placeholder={t('画像名・タグ・説明で検索', 'Search by name, tag or description')} value={query} count={shown.length} onChange={setQuery} />
      <FilterChips allLabel={t('すべて', 'All')} toggle options={purposes.map((c) => ({ value: c, label: optionLabel(c) }))} value={purpose} onChange={setPurpose} />
      <Caption1 className={styles.caption}>
        {t('クリックで設定(ドラッグ&ドロップでも設定できます)', 'Click to set (drag and drop also works)')}
      </Caption1>
      <div className={styles.grid}>
        {shown.map((h) => {
          const used = h.id === selectedId
          const select = () => {
            if (!used) onSelect(h.id)
          }
          return (
            <div
              key={h.id}
              role="button"
              tabIndex={0}
              title={[h.name, h.tags, h.description].filter(Boolean).join('\n')}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DND_HERO, h.id)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={select}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  select()
                }
              }}
              className={mergeClasses(styles.card, used && styles.cardUsed)}
            >
              <ImageThumb src={heroImage(h)} alt={h.name} aspectRatio="4 / 3" />
              {used && <Badge appearance="filled" color="brand" className={styles.badge}>{t('設定中', 'In use')}</Badge>}
              <div className={styles.info}>
                <Text weight="semibold" size={300} truncate wrap={false} block>{h.name}</Text>
                <Caption1 className={styles.line}>
                  {h.image_code} ・ {optionLabel(h.purpose_name)} ・ {optionLabel(h.season_name)}
                </Caption1>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
