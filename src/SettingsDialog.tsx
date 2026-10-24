// 設定の画面(ST10)。⚙ はこの画面の入口だけにする(メニューに設定を並べない)。
// 左に「自分 / 国 / 全社 /(畳んだ)開発・管理」の並び(Fluent の Nav)、右にその中身。
// 実際の設定と、開発向けの操作(取り込み・見本のデータ)が混ざって乱雑だったので分け、開発向けは畳んで、すぐ見えないようにする
// (デモで利用者に触ってもらうため。ログイン ST6 ができたら、管理者だけに見せる)。
// いまは画面の形だけ(ST10 の (a))。国・全社の中身は、これまでの窓を「開く」で開く。OK のあと、窓の中身をここに移す((b))
import { useState, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogTitle,
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
  Switch,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import { DismissRegular, PersonRegular, SendRegular, WrenchRegular } from '@fluentui/react-icons'
import { ResizableSurface } from './ResizableSurface'
import { Splitter } from './Splitter'
import { usePaneWidths } from './floatLayout'
import { useT } from './i18n'

/** 設定の画面に並べる 1 つの操作(これまでの ⚙ のメニューの 1 項目) */
export interface SettingsAction {
  id: string
  /** 置き場所。country = 国ごとに決める / company = 全部の国で共通 / data・samples・dev = 開発・管理(畳む) */
  section: 'country' | 'company' | 'data' | 'samples' | 'dev'
  label: ReactNode
  description?: string
  icon: ReactElement
  onOpen: () => void
  disabled?: boolean
  /** 右に添える短い情報(取り込んだ時刻・件数など) */
  secondary?: ReactNode
  /** この環境では出さない(BigQuery の設定がないときなど) */
  hidden?: boolean
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
  /** ヘッダーで選んでいる国の名前(「すべての国」のときは空) */
  countryName: string
  lang: 'ja' | 'en'
  onLang: (lang: 'ja' | 'en') => void
  autoDraft: boolean
  onAutoDraft: (on: boolean) => void
  actions: SettingsAction[]
}

const ADMIN = ['data', 'samples', 'dev'] as const

export function SettingsDialog({ open, onClose, countryName, lang, onLang, autoDraft, onAutoDraft, actions }: Props) {
  const s = useStyles()
  const t = useT()
  const [page, setPage] = useState('me')
  const panes = usePaneWidths('settings.paneWidths.v1', [240, 0], 1, { min: 180, max: 400 })
  const shown = actions.filter((a) => !a.hidden)
  const of = (section: SettingsAction['section']) => shown.filter((a) => a.section === section)
  const adminName = { data: t('取り込み・書き出し', 'Import and export'), samples: t('見本のデータ', 'Sample data'), dev: t('開発へのリクエスト', 'Requests to developers') }
  const countryHead = countryName ? t(`国: ${countryName}`, `Country: ${countryName}`) : t('国(ヘッダーで国を選ぶ)', 'Country (pick one in the header)')
  // 差出人の名前(SU5)を国ごとに決めるか全社で決めるかは、まだ決めていない。置き場所の案として、国に出しておく
  const senderPage = 'sender'

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
            {/* 閉じた案内を戻す(X72 の具体例 2)。案内を閉じられるようにするときに、ここにつなぐ */}
            <span>
              <Button size="small" disabled>
                {t('ヒントをもう一度出す', 'Show tips again')}
              </Button>
            </span>
            <span className={s.note}>{t('閉じた案内を、もう一度出します(案内を閉じられるようにするときに使えるようにします)。', 'Shows the tips you closed again (available once tips can be closed).')}</span>
          </div>
        </>
      )
    if (page === senderPage)
      return (
        <>
          <span className={s.heading}>{t('差出人の名前', 'Sender name')}</span>
          <span className={s.note}>
            {t(
              'メールの受信箱に出る差出人の名前(いまは見本の「SHOP」)。国ごとに決めるか、全社で 1 つにするかを、まだ決めていません。',
              'The sender name shown in the inbox (currently the sample "SHOP"). Whether it is set per country or once for the company is not decided yet.',
            )}
          </span>
        </>
      )
    if ((ADMIN as readonly string[]).includes(page)) {
      const key = page as (typeof ADMIN)[number]
      return (
        <>
          <span className={s.heading}>{adminName[key]}</span>
          <span className={s.note}>{t('開発・管理の操作です。ふだんの作業では使いません。', 'Developer and admin operations. Not needed for everyday work.')}</span>
          <div>{of(key).map(actionRow)}</div>
        </>
      )
    }
    const a = shown.find((x) => x.id === page)
    if (!a) return null
    return (
      <>
        <span className={s.heading}>{a.label}</span>
        {a.description && <span className={s.note}>{a.description}</span>}
        <span>
          <Button appearance="primary" icon={a.icon} disabled={a.disabled} onClick={a.onOpen}>
            {t('開く', 'Open')}
          </Button>
        </span>
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
              <NavItem value={senderPage} icon={<SendRegular />}>
                {t('差出人の名前(検討中)', 'Sender name (undecided)')}
              </NavItem>
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
