// 設定の画面(ST10)。⚙ はこの画面の入口だけにする(メニューに設定を並べない)。
// 左に「自分 / 国 / 全社 /(畳んだ)開発・管理」の並び(Fluent の Nav)、右にその中身。
// 実際の設定と、開発向けの操作(取り込み・見本のデータ)が混ざって乱雑だったので分け、開発向けは畳んで、すぐ見えないようにする
// (デモで利用者に触ってもらうため。ログイン ST6 ができたら、管理者だけに見せる)。
// 中身は、項目ごとに render で右に描く(ST10 の (b))。まだ移していない項目は、これまでの窓を「開く」で開く
import { useState, useSyncExternalStore, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogTitle,
  InfoLabel,
  Nav,
  NavCategory,
  NavCategoryItem,
  NavDivider,
  NavItem,
  NavSectionHeader,
  NavSubItem,
  NavSubItemGroup,
  Radio,
  RadioGroup,
  Select,
  Switch,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import { DismissRegular, PersonRegular, WrenchRegular } from '@fluentui/react-icons'
import { ResizableSurface } from './ResizableSurface'
import { Splitter } from './Splitter'
import { usePaneWidths } from './floatLayout'
import { countryOptions } from './status'
import { dismissedHintCount, getHintsVersion, resetHints, subscribeHints } from './hints'
import { optionLabel, useT } from './i18n'

/** 設定の画面に並べる 1 つの操作(これまでの ⚙ のメニューの 1 項目) */
export interface SettingsAction {
  id: string
  /** 置き場所。country = 国ごとに決める / company = 全部の国で共通 / data・samples・dev = 開発・管理(畳む) */
  section: 'country' | 'company' | 'data' | 'samples' | 'dev'
  label: ReactNode
  description?: string
  icon: ReactElement
  /** 窓を開く・操作を行う(render があれば使わない) */
  onOpen?: () => void
  disabled?: boolean
  /** 右に添える短い情報(取り込んだ時刻・件数など) */
  secondary?: ReactNode
  /** この環境では出さない(BigQuery の設定がないときなど) */
  hidden?: boolean
  /** 詳しい説明(見出しの横の ⓘ に出す。見出しの下に長い説明を並べない) */
  info?: string
  /** 右に描く中身(国の項目には、設定の画面で決めた国のコードと名前が来る)。なければ「開く」で窓を開く */
  render?: (country: string, countryName: string) => ReactNode
}

const useStyles = makeStyles({
  surface: { width: 'calc(92vw / var(--ui-zoom, 1))', maxWidth: '1180px', padding: 0 },
  body: { display: 'flex', flexDirection: 'column', rowGap: 0, height: 'calc(80vh / var(--ui-zoom, 1))' },
  title: { display: 'flex', alignItems: 'center', padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  titleText: { flexGrow: 1 },
  content: { display: 'grid', gridTemplateColumns: 'var(--cols)', flexGrow: 1, minHeight: 0, padding: 0, overflow: 'hidden' },
  nav: { overflowY: 'auto', backgroundColor: tokens.colorNeutralBackground2, minWidth: 0, height: '100%', boxSizing: 'border-box' },
  main: { overflowY: 'auto', padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalXL}`, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalL, minWidth: 0 },
  heading: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold },
  // 中身の欄は、右の残りの高さいっぱいに(画像のライブラリのように、中で一覧だけを送るものがあるため)
  pane: { display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 },
  headRow: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM, flexWrap: 'wrap' },
  sub: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS },
  subHead: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  note: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  row: {
    display: 'grid',
    gridTemplateColumns: '20px 1fr auto',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  rowIcon: { display: 'flex', color: tokens.colorNeutralForeground3, fontSize: '20px' },
  rowText: { display: 'flex', flexDirection: 'column', rowGap: '2px', minWidth: 0 },
  rowLabel: { fontSize: tokens.fontSizeBase300 },
  rowActions: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
})

interface Props {
  open: boolean
  onClose: () => void
  /** ヘッダーで選んでいる国のコード(「すべての国」のときは空。国の項目では、この画面の中で選ぶ) */
  country: string
  lang: 'ja' | 'en'
  onLang: (lang: 'ja' | 'en') => void
  autoDraft: boolean
  onAutoDraft: (on: boolean) => void
  actions: SettingsAction[]
}

const ADMIN = ['data', 'samples', 'dev'] as const

export function SettingsDialog({ open, onClose, country: headerCountry, lang, onLang, autoDraft, onAutoDraft, actions }: Props) {
  const s = useStyles()
  const t = useT()
  const [page, setPage] = useState('me')
  // 戻したら(版が上がる)数を数え直す。閉じたときは版が上がらないが、窓を開くたびに描き直すので、数は新しい
  useSyncExternalStore(subscribeHints, getHintsVersion)
  const hintCount = dismissedHintCount()
  // ヘッダーが「すべての国」のときに、国の項目で使う国(ヘッダーで国を選んでいれば、そちらを使う)
  const [picked, setPicked] = useState(String(countryOptions[0]?.value ?? ''))
  const country = headerCountry || picked
  const nameOf = (code: string) => optionLabel(countryOptions.find((o) => String(o.value) === code)?.label) || code
  const countryName = nameOf(country)
  const panes = usePaneWidths('settings.paneWidths.v1', [240, 0], 1, { min: 180, max: 400 })
  const shown = actions.filter((a) => !a.hidden)
  const of = (section: SettingsAction['section']) => shown.filter((a) => a.section === section)
  const adminName = { data: t('取り込み・書き出し', 'Import and export'), samples: t('見本のデータ', 'Sample data'), dev: t('開発へのリクエスト', 'Requests to developers') }
  const countryHead = t(`国: ${countryName}`, `Country: ${countryName}`)

  const actionRow = (a: SettingsAction) => (
    <div key={a.id} className={s.row}>
      <span className={s.rowIcon}>{a.icon}</span>
      <span className={s.rowText}>
        <span className={s.rowLabel}>{a.label}</span>
        {a.description && <span className={s.note}>{a.description}</span>}
      </span>
      <span className={s.rowActions}>
        {a.secondary && <span className={s.note}>{a.secondary}</span>}
        <Button size="small" disabled={a.disabled} onClick={a.onOpen}>
          {t('行う', 'Run')}
        </Button>
      </span>
    </div>
  )

  const body = (): ReactNode => {
    if (page === 'me')
      return (
        <>
          <span className={s.heading}>{t('自分の設定', 'My settings')}</span>
          <span className={s.note}>{t('このブラウザに覚えます。ほかの人には効きません。', 'Saved in this browser. Does not affect anyone else.')}</span>
          <div className={s.sub}>
            <span className={s.subHead}>{t('表示', 'Display')}</span>
            <RadioGroup layout="horizontal" value={lang} onChange={(_, d) => (d.value === 'ja' || d.value === 'en') && onLang(d.value)} aria-label={t('言語', 'Language')}>
              <Radio value="ja" label="日本語" />
              <Radio value="en" label="English" />
            </RadioGroup>
          </div>
          <div className={s.sub}>
            <span className={s.subHead}>{t('AI', 'AI')}</span>
            <Switch checked={autoDraft} onChange={(_, d) => onAutoDraft(d.checked)} label={t('配信カードを開いたとき、自動で下書きする', 'Auto-draft when a delivery card opens')} />
          </div>
          <div className={s.sub}>
            <span className={s.subHead}>{t('ヒント', 'Tips')}</span>
            {/* 閉じた案内(Hint)を戻す(X72 の具体例 2)。閉じたものがないときは押せない(押しても何も起きないため) */}
            <span>
              <Button size="small" disabled={hintCount === 0} onClick={resetHints}>
                {t('ヒントをもう一度出す', 'Show tips again')}
              </Button>
            </span>
            <span className={s.note}>
              {hintCount > 0
                ? t(`閉じた案内(${hintCount} 件)を、もう一度出します。`, `Shows the ${hintCount} tip(s) you closed again.`)
                : t('閉じた案内はありません。案内の × で閉じると、ここで戻せます。', 'No closed tips. Tips you close with × can be restored here.')}
            </span>
          </div>
        </>
      )
    if ((ADMIN as readonly string[]).includes(page)) {
      const key = page as (typeof ADMIN)[number]
      return (
        <>
          <span className={s.heading}>{adminName[key]}</span>
          <span className={s.note}>{t('開発・管理の操作です。ふだんの作業では使いません。', 'Developer and admin operations. Not needed for everyday work.')}</span>
          {/* 中身を描く項目(開発へのリクエストの一覧など)は、そのまま描く。操作だけの項目は「行う」の行に並べる */}
          <div>{of(key).map((x) => (x.render ? <div key={x.id}>{x.render(country, countryName)}</div> : actionRow(x)))}</div>
        </>
      )
    }
    const a = shown.find((x) => x.id === page)
    if (!a) return null
    return (
      <>
        <span className={s.headRow}>
          {a.info ? (
            <InfoLabel className={s.heading} info={a.info} size="large">
              {a.label}
            </InfoLabel>
          ) : (
            <span className={s.heading}>{a.label}</span>
          )}
          {/* ヘッダーが「すべての国」のときは、ここで国を選ぶ(ヘッダーで選んでいれば、その国に決まっている) */}
          {a.section === 'country' && !headerCountry && (
            <Select size="small" value={country} onChange={(_, d) => setPicked(d.value)} aria-label={t('国', 'Country')}>
              {countryOptions.map((o) => (
                <option key={o.value} value={String(o.value)}>
                  {optionLabel(o.label)}
                </option>
              ))}
            </Select>
          )}
        </span>
        {a.description && <span className={s.note}>{a.description}</span>}
        {a.render ? (
          <div key={`${a.id}:${country}`} className={s.pane}>
            {a.render(country, countryName)}
          </div>
        ) : (
          <span>
            <Button appearance="primary" icon={a.icon} disabled={a.disabled} onClick={a.onOpen}>
              {t('開く', 'Open')}
            </Button>
          </span>
        )}
      </>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <ResizableSurface sizeKey="settings" min={{ w: 640, h: 420 }} className={s.surface}>
        <DialogBody className={s.body}>
          {/* 閉じるボタンは、題の行の右端に自分で置く(DialogTitle の action は、この画面の 2 列の並びの中で位置がずれるため) */}
          <div className={s.title}>
            <DialogTitle className={s.titleText}>{t('設定', 'Settings')}</DialogTitle>
            <Button appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={onClose} />
          </div>
          <DialogContent className={s.content} style={{ '--cols': panes.columns } as CSSProperties}>
            <Nav className={s.nav} selectedValue={page} onNavItemSelect={(_, d) => setPage(String(d.value))} aria-label={t('設定の並び', 'Settings sections')}>
              <NavItem value="me" icon={<PersonRegular />}>
                {t('自分の設定', 'My settings')}
              </NavItem>
              <NavSectionHeader>{countryHead}</NavSectionHeader>
              {of('country').map((a) => (
                <NavItem key={a.id} value={a.id} icon={a.icon}>
                  {a.label}
                </NavItem>
              ))}
              <NavSectionHeader>{t('全社', 'Company')}</NavSectionHeader>
              {of('company').map((a) => (
                <NavItem key={a.id} value={a.id} icon={a.icon}>
                  {a.label}
                </NavItem>
              ))}
              <NavDivider />
              {/* 開発・管理は畳んでおく(開くかどうかは覚えない。デモで開いたまま残らないように) */}
              <NavCategory value="admin">
                <NavCategoryItem icon={<WrenchRegular />}>{t('開発・管理', 'Developer & admin')}</NavCategoryItem>
                <NavSubItemGroup>
                  {ADMIN.map((k) => (
                    <NavSubItem key={k} value={k}>
                      {adminName[k]}
                    </NavSubItem>
                  ))}
                </NavSubItemGroup>
              </NavCategory>
            </Nav>
            <Splitter onDrag={panes.onDrag(0)} onDone={panes.onDone} />
            <div className={s.main}>{body()}</div>
          </DialogContent>
        </DialogBody>
      </ResizableSurface>
    </Dialog>
  )
}
