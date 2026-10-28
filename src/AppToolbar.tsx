import { useEffect, useState, type ReactNode } from 'react'
import {
  Badge,
  Button,
  Menu,
  type MenuButtonProps,
  MenuItem,
  MenuItemRadio,
  MenuList,
  MenuPopover,
  MenuTrigger,
  SplitButton,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import { typo } from './typo'
import {
  AddRegular,
  AlertRegular,
  CalendarLtrRegular,
  ChevronDownRegular,
  DataBarVerticalRegular,
  GlobeRegular,
  LightbulbRegular as DevRequestIcon,
  PaintBrushRegular,
  QuestionCircleRegular,
  SettingsRegular,
} from '@fluentui/react-icons'
import { AiIcon } from './AiMark'
import { MePicker } from './MePicker'
import { InboxButton } from './InboxButton'
import { DevPinsToggle } from './DevPinsToggle'
import type { ApprovalInbox } from './useApprovalInbox'
import { FACE_COLOR, FACE_LOGO, FACE_TINT, type Face } from './faces'
import { optionLabel, tr, useT } from './i18n'
import { channelOptions, countryOptions, statusOptions } from './status'
import { THEME_TYPES, themeTypeLabel } from './themeTypes'
import { Z } from './layers'
import { HelpAskFloat } from './help/HelpAskFloat'
import { SpotlightLayer } from './help/SpotlightLayer'
import { captureHelpPart, type HelpPart } from './help/helpAsk'
import { setGlobalMenuItems } from './ContextMenu'
import { capturePlace } from './devRequestPlace'
import { noFilter, useFaceButtonStyles, type Filters, type Page } from './appToolbarParts'

const useStyles = makeStyles({
  // ヘッダーと面の帯を、ひとまとめで上に留める
  headerWrap: { position: 'sticky', top: 0, zIndex: Z.header, boxShadow: tokens.shadow2 },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    rowGap: tokens.spacingVerticalS,
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalXL}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
  },
  // 面の帯(X38): ヘッダーのすぐ下の細い帯。面の色の線と、ロゴ風の面の名前
  faceBand: { display: 'flex', alignItems: 'center', columnGap: '10px', height: '22px', padding: `0 ${tokens.spacingHorizontalXL}`, borderBottomWidth: '3px', borderBottomStyle: 'solid' },
  faceLogo: { fontSize: '12px', fontWeight: 800, letterSpacing: '0.18em', lineHeight: 1 },
  faceHint: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  headerIcon: { color: tokens.colorBrandForeground1, flexShrink: 0 },
  title: {
    margin: 0,
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase400,
    letterSpacing: '0.01em',
    whiteSpace: 'nowrap',
    // 画面が狭いときは、アプリ名の文字を隠してアイコンだけにする(絞り込みの札をヘッダーの 1 段に収めるため。X39)
  },
  // ヘッダーの絞り込みの札(X39)。収まらないときだけ、2 段目に回る
  // 絞り込みの段(X42): ヘッダーのすぐ下。ヘッダーより一段控えめな地
  filterBar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', padding: `6px ${tokens.spacingHorizontalXL}`, backgroundColor: tokens.colorNeutralBackground1, borderTop: `1px solid ${tokens.colorNeutralStroke3}` },
  filterBarDivider: { width: '1px', alignSelf: 'stretch', margin: '2px 6px', backgroundColor: tokens.colorNeutralStroke2 },
  filterBarLabel: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, marginRight: '4px' },
  // 表(計画)と裏(結果)の切り替え。題名のすぐ横に固定して、どちらの面でも位置が動かないようにする
  faceSwitch: {
    display: 'inline-flex',
    padding: '2px',
    columnGap: '2px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  headerSpacer: { flexGrow: 1 },
  // 国の切り替え(X33): 計画 | 結果 の切り替えと同じ枠・同じ高さ
  countryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '6px',
    padding: `5px ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground1,
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    fontWeight: tokens.fontWeightSemibold,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  countryIcon: { fontSize: '16px', color: tokens.colorNeutralForeground2 },
  countryChevron: { fontSize: '12px', color: tokens.colorNeutralForeground3 },
  // 絞り込みの札(名前: 値 ▾)。札の全体が押せる
  filterChip: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '4px',
    height: '28px',
    padding: '0 10px 0 12px',
    boxSizing: 'border-box',
    borderRadius: tokens.borderRadiusCircular,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    fontFamily: 'inherit',
    backgroundColor: tokens.colorNeutralBackground1,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    ':focus-visible': { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: '1px' },
  },
  // 「すべて」以外を選んでいる(絞り込み中)
  filterChipOn: { border: `1px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1, ':hover': { backgroundColor: tokens.colorBrandBackground2Hover } },
  filterChipLabel: { ...typo.pairLabel, whiteSpace: 'nowrap' },
  filterChipValue: { fontWeight: tokens.fontWeightSemibold, whiteSpace: 'nowrap' },
  // 絞り込みの選ぶ一覧(項目の幅をそろえ、少し広めに)
  filterMenu: { minWidth: '180px' },
  filterChipChevron: { fontSize: '12px', marginLeft: '2px', color: tokens.colorNeutralForeground3 },
  // ヘッダーの「あなた」
  headerMe: { maxWidth: '200px' },
})

function FilterSelect({ label, value, options, onChange }: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  const styles = useStyles()
  const t = useT()
  // 名前を札の中に入れた、1 行の細い絞り込み(名前を上に置くと、2 行分の高さを取るため)。「すべて」以外を選んでいる札は、色を付けて目立たせる。
  // 選ぶ一覧は、ブラウザ標準のものではなく、ほかのメニューと同じ見た目(余白があり、選んでいる値にチェック)
  const current = value === '' ? t('すべて', 'All') : optionLabel(options.find((o) => String(o.value) === value)?.label ?? value)
  return (
    <Menu
      positioning="below-start"
      checkedValues={{ [label]: [value] }}
      onCheckedValueChange={(_, d) => onChange(d.checkedItems[0] ?? '')}
    >
      <MenuTrigger disableButtonEnhancement>
        <button type="button" className={mergeClasses(styles.filterChip, value !== '' && styles.filterChipOn)} aria-label={`${label}: ${current}`}>
          {/* 選んでいないときは名前だけ(「すべて」は情報が少ないので出さない。ヘッダーに収めるため短くする)。選んだら「名前: 値」 */}
          {value === '' ? (
            <span>{label}</span>
          ) : (
            <>
              <span className={styles.filterChipLabel}>{label}:</span>
              <span className={styles.filterChipValue}>{current}</span>
            </>
          )}
          <ChevronDownRegular className={styles.filterChipChevron} aria-hidden />
        </button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList className={styles.filterMenu}>
          <MenuItemRadio name={label} value="">{t('すべて', 'All')}</MenuItemRadio>
          {options.map((o) => (
            <MenuItemRadio key={o.value} name={label} value={String(o.value)}>{optionLabel(o.label)}</MenuItemRadio>
          ))}
        </MenuList>
      </MenuPopover>
    </Menu>
  )
}


/**
 * 画面の上の帯(App から分けた。整理 第 3 段): ヘッダー(国・アラート・リクエスト・依頼・新規作成・ログインしている人・⚙)、
 * 作業の段(面の切り替えと、配信の絞り込み)、面の帯。設定の画面は settingsDialog で受け取り、⚙ の隣に置く
 */
export function AppToolbar({
  filters,
  onFilters,
  onCountry,
  page,
  onFace,
  personOptions,
  alertsOpen,
  alertCount,
  alertDanger,
  onOpenAlerts,
  onOpenDevRequests,
  inbox,
  onOpenCard,
  onNew,
  onBulk,
  onOpenSettings,
  settingsDialog,
}: {
  filters: Filters
  onFilters: (f: Filters) => void
  /** 国を変える(覚えておき、次に開いたときも同じ国で始める) */
  onCountry: (v: string) => void
  page: Page
  onFace: (p: Page) => void
  /** 担当の候補(いちばん上に「自分」) */
  personOptions: { value: string; label: string }[]
  alertsOpen: boolean
  alertCount: number
  /** 在庫切れがある(件数の印を赤くする) */
  alertDanger: boolean
  onOpenAlerts: () => void
  onOpenDevRequests: () => void
  inbox: ApprovalInbox
  onOpenCard: (id: string) => void
  /** 配信を 1 本、新規作成 */
  onNew: () => void
  /** まとめて作る(作業画面) */
  onBulk: () => void
  onOpenSettings: () => void
  settingsDialog: ReactNode
}) {
  const styles = useStyles()
  const faceBtn = useFaceButtonStyles()
  const t = useT()
  // 面の色・帯に使う面(アラートは面ではないので、計画の色)
  const face: Face = page === 'production' || page === 'results' ? page : 'calendar'
  // 国はヘッダーの設定なので、絞り込みの「クリア」の対象にしない
  const filtering = filters.channel !== '' || filters.department !== '' || (page !== 'results' && filters.status !== '') || filters.person !== ''
  const setFilter = (k: keyof Filters) => (v: string) => onFilters({ ...filters, [k]: v })
  // 「？ 聞く」(X82)。どの画面からも開けるよう、上の帯が持つ
  const [helpOpen, setHelpOpen] = useState(false)
  // 右クリックの「ここについて聞く」(X82 の段 ③)。どの右クリックのメニューにも、「開発に伝える」の前に足す
  const [helpPart, setHelpPart] = useState<HelpPart | null>(null)
  useEffect(() => {
    // 配信カードの目印(data-card-id)の名前は、画面に出ている文字から(ここでは配信の一覧を持たないため)
    const cardName = (id: string) => document.querySelector(`[data-card-id="${CSS.escape(id)}"]`)?.textContent?.trim().slice(0, 30) ?? ''
    setGlobalMenuItems(
      (x, y) => [
        {
          key: 'help-ask',
          label: tr('ここについて聞く', 'Ask about this'),
          icon: <QuestionCircleRegular />,
          onSelect: () => {
            setHelpPart(captureHelpPart(x, y, capturePlace(x, y, cardName)))
            setHelpOpen(true)
          },
        },
      ],
      'help-ask',
      10,
    )
    return () => setGlobalMenuItems(null, 'help-ask')
  }, [])
  return (
    <div className={styles.headerWrap}>
    <header className={styles.header}>
      <CalendarLtrRegular fontSize={24} className={styles.headerIcon} />
      <h1 className={styles.title}>{t('コンテンツプランナー', 'Contents Planner')}</h1>
      {/* 国(X33): どの国の仕事をしているか。担当の国は、決めたらあまり変えない。全体を見る人は「すべての国」 */}
      <Menu positioning="below-start" checkedValues={{ country: [filters.country] }} onCheckedValueChange={(_, d) => onCountry(d.checkedItems[0] ?? '')}>
        <MenuTrigger disableButtonEnhancement>
          <button type="button" className={styles.countryBtn} aria-label={t(`国: ${filters.country || 'すべての国'}`, `Country: ${filters.country || 'All countries'}`)} title={t('どの国の配信を扱うか(画面のすべてに効きます。次に開いたときも同じ国)', 'Which country you work on (applies to the whole app and is remembered)')}>
            <GlobeRegular className={styles.countryIcon} />
            {filters.country ? optionLabel(countryOptions.find((o) => String(o.value) === filters.country)?.label ?? filters.country) : t('すべての国', 'All countries')}
            <ChevronDownRegular className={styles.countryChevron} />
          </button>
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            <MenuItemRadio name="country" value="">{t('すべての国', 'All countries')}</MenuItemRadio>
            {countryOptions.map((o) => (
              <MenuItemRadio key={o.value} name="country" value={String(o.value)}>{optionLabel(o.label)}</MenuItemRadio>
            ))}
          </MenuList>
        </MenuPopover>
      </Menu>
      <span className={styles.headerSpacer} />
      {/* 使い方を AI に聞く(X82)。機能の説明の文書と、画面にある文言をもとに、手順と開く場所を答える */}
      <Tooltip content={t('使い方を AI に聞く(やりたいことを書くと、手順と開く場所を答えます)', 'Ask AI how to use this (describe what you want; get steps and where to go)')} relationship="description">
        <Button appearance={helpOpen ? 'primary' : 'subtle'} size="small" icon={<QuestionCircleRegular />} onClick={() => {
          setHelpPart(null)
          setHelpOpen(true)
        }}>
          {t('聞く', 'Ask')}
        </Button>
      </Tooltip>
      {/* 「？ 聞く」の答えのボタン・欄を光らせる層(フロートを閉じても、少しのあいだ残す。X83) */}
      <SpotlightLayer />
      {helpOpen && (
        <HelpAskFloat
          open
          part={helpPart}
          onClearPart={() => setHelpPart(null)}
          onClose={() => {
            setHelpOpen(false)
            setHelpPart(null)
          }}
        />
      )}
      {/* アラート: 配信に影響する変更(いまは在庫)。件数は、どの画面からも見えるように、ヘッダーに出す */}
      <Tooltip content={t('配信に影響する変更(在庫切れ・在庫僅少・MD 方針の変更・日程の変更)', 'Changes that affect deliveries (stock, MD policy, dates)')} relationship="description">
        <Button
          appearance={alertsOpen ? 'primary' : 'subtle'}
          size="small"
          icon={<AlertRegular />}
          onClick={onOpenAlerts}
        >
          {t('アラート', 'Alerts')}
          {alertCount > 0 && (
            <Badge size="small" appearance="filled" color={alertDanger ? 'danger' : 'warning'} style={{ marginLeft: 6 }}>
              {alertCount}
            </Badge>
          )}
        </Button>
      </Tooltip>
      {/* 開発へのリクエスト(画面のどこでも右クリック →「開発に伝える」で書いたもの)の一覧 */}
      <Tooltip content={t('開発へのリクエストの一覧(画面のどこでも、右クリック →「開発に伝える」で書けます)', 'Requests to developers (write one anywhere: right-click → "Tell the developers")')} relationship="label">
        <Button appearance="subtle" size="small" icon={<DevRequestIcon />} onClick={onOpenDevRequests}>
          {/* 依頼の InboxButton も英語は Requests なので、こちらは Dev requests にして見分ける */}
          {t('リクエスト', 'Dev requests')}
        </Button>
      </Tooltip>
      {/* リクエストのピンを出す / 出さない(X69 (b)。人ごとに覚える) */}
      <DevPinsToggle />
      {/* 自分宛ての承認の依頼(U5)。メールが届かない段階でも、依頼に気づけるように、ヘッダーに出す */}
      <InboxButton inbox={inbox} onOpenCard={onOpenCard} />
      {/* 作る操作は、ここにまとめる。ボタンの本体で 1 本を新規作成、▾ で、この週の枠を作る(W14。週の表示のときだけ選べる) */}
      <Menu positioning="below-end">
        <MenuTrigger disableButtonEnhancement>
          {(triggerProps: MenuButtonProps) => (
            <SplitButton
              appearance="primary"
              size="small"
              icon={<AddRegular />}
              menuButton={{ ...triggerProps, 'aria-label': t('新規作成のほかの方法', 'More ways to create') }}
              primaryActionButton={{ onClick: onNew }}
            >
              {t('新規作成', 'New')}
            </SplitButton>
          )}
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            <MenuItem icon={<AddRegular />} onClick={onNew}>
              {t('配信を 1 本、新規作成', 'New delivery')}
            </MenuItem>
            <MenuItem icon={<AiIcon size={16} />} secondaryContent={t('作業画面', 'Workspace')} onClick={onBulk}>
              {t('まとめて作る(週・国・チャネルを選び、AI で中身まで)', 'Create in bulk (week, country & channel, then AI content)')}
            </MenuItem>
          </MenuList>
        </MenuPopover>
      </Menu>
      {/* ログインしている人(U9)。履歴・依頼・承認・やり取りは、すべてこの人で残す(ほかの画面では人を選ばせない) */}
      <MePicker className={styles.headerMe} ariaLabel={t('ログインしている人', 'Signed-in user')} />
      {/* 設定(ST10): ⚙ は設定の画面の入口だけ。自分・国・全社・(畳んだ)開発・管理を、左の並びから選ぶ */}
      <Tooltip content={t('設定', 'Settings')} relationship="label">
        <Button appearance="subtle" size="small" icon={<SettingsRegular />} onClick={onOpenSettings} />
      </Tooltip>
      {settingsDialog}
    </header>
    {/* 作業の段(X42・X43): ヘッダー(システム全体)とは分け、その下に置く。左端に面の切り替え、続いて見ている画面の配信の絞り込み */}
      <div className={styles.filterBar}>
      {/* 計画・制作・結果の切り替え(X43): ヘッダー(システム全体)ではなく、作業の段の左端。同じ期間・見せ方・絞り込みのまま、面だけを切り替える */}
      <div className={styles.faceSwitch} role="tablist" aria-label={t('計画と結果', 'Plan and results')}>
        {(
          [
            ['calendar', t('計画', 'Plan'), <CalendarLtrRegular key="i" />],
            ['production', t('制作', 'Production'), <PaintBrushRegular key="i" />],
            ['results', t('結果', 'Results'), <DataBarVerticalRegular key="i" />],
          ] as const
        ).map(([p, label, icon]) => (
          <button key={p} type="button" role="tab" aria-selected={page === p} className={mergeClasses(faceBtn.faceBtn, page === p && faceBtn.faceBtnOn)} style={page === p ? { color: FACE_COLOR[p] } : undefined} onClick={() => onFace(p)}>
            {icon}
            {label}
          </button>
        ))}
      </div>
      <span className={styles.filterBarDivider} aria-hidden />
      <span className={styles.filterBarLabel}>{t('絞り込み', 'Filters')}</span>
        <FilterSelect label={t('チャネル', 'Channel')} value={filters.channel} options={channelOptions} onChange={setFilter('channel')} />
        <FilterSelect label={t('種類', 'Type')} value={filters.department} options={THEME_TYPES.map((v) => ({ value: v, label: themeTypeLabel(v) }))} onChange={setFilter('department')} />
        {/* ステータス(未起案・承認待ち・承認済み)は計画の面だけ。結果の面は送ったあとの配信なので、絞り込みも効かせない */}
        {page !== 'results' && <FilterSelect label={t('ステータス', 'Status')} value={filters.status} options={statusOptions} onChange={setFilter('status')} />}
        <FilterSelect label={t('担当', 'Owner')} value={filters.person} options={personOptions} onChange={setFilter('person')} />
        {filtering && <Button size="small" appearance="subtle" onClick={() => onFilters({ ...noFilter, country: filters.country })}>{t('クリア', 'Clear')}</Button>}
      </div>
    {/* 面の帯(X38): いまどの面にいるかを、面の色の線とロゴ風の名前で示す */}
    <div className={styles.faceBand} style={{ backgroundColor: FACE_TINT[face], borderBottomColor: FACE_COLOR[face] }}>
      <span className={styles.faceLogo} style={{ color: FACE_COLOR[face] }}>{FACE_LOGO[face]}</span>
      <span className={styles.faceHint}>
        {{ calendar: t('配信の企画と承認', 'Plan and approve deliveries'), production: t('制作に渡したものと進み具合', 'Handoffs and production progress'), results: t('送ったあとの数字と振り返り', 'Numbers and lessons after sending') }[face]}
      </span>
    </div>
    </div>
  )
}
