import { useState } from 'react'
import { Badge, Button, MessageBar, MessageBarBody, Spinner, Tab, TabList, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ChevronDownRegular, ChevronRightRegular, EyeRegular, PlayRegular, TableRegular } from '@fluentui/react-icons'
import { DevApi, RunApi, bytesLabel, isFailure, type Column, type ColumnProfile, type Row, type TableInfo } from './api'
import { ColumnProfileView } from './ColumnProfileView'
import { CopyButton } from './CopyButton'
import { ResultGrid } from './ResultGrid'
import { columnsMarkdown } from './format'

const useStyles = makeStyles({
  card: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: 0,
  },
  head: { display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 },
  toggle: { border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flexGrow: 1, color: tokens.colorNeutralForeground1 },
  name: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  // 概要は、項目を横に並べて 1〜2 行に収める(縦に長くしない)
  facts: { display: 'flex', flexWrap: 'wrap', columnGap: '14px', rowGap: '2px', fontSize: tokens.fontSizeBase200 },
  key: { color: tokens.colorNeutralForeground3, fontWeight: tokens.fontWeightSemibold, marginRight: '4px' },
  desc: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  // タブの中身。高さは右下をドラッグして変えられる
  body: { height: '220px', minHeight: '80px', resize: 'vertical', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' },
  row: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  sql: { margin: 0, fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  muted: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  cols: { borderCollapse: 'collapse', fontSize: tokens.fontSizeBase200 },
  th: { position: 'sticky', top: 0, textAlign: 'left', padding: '3px 8px', backgroundColor: tokens.colorNeutralBackground3, fontWeight: tokens.fontWeightSemibold, whiteSpace: 'nowrap' },
  td: { padding: '1px 8px', borderBottom: `1px solid ${tokens.colorNeutralStroke3}`, verticalAlign: 'middle' },
  mono: { fontFamily: tokens.fontFamilyMonospace, whiteSpace: 'nowrap' },
})

type TabKey = 'columns' | 'profile' | 'rows' | 'view' | 'sources'

const OPEN_KEY = 'ccp-dev-detail-open'
const readOpen = () => {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== '0'
  } catch {
    return true
  }
}

interface Props {
  refName: string
  info: TableInfo | null
  error: string
  loading: boolean
  onOpenTable: (ref: string) => void
  onUseSql: (sql: string) => void
  /** AI に聞く(列の中身を会話に送る) */
  onAsk?: (text: string) => void
}

/** 選んだ表・ビューの詳細(概要は横に並べ、列・先頭の行・ビューの SQL・参照先はタブで切り替える。畳める) */
export function TableDetail({ refName, info, error, loading, onOpenTable, onUseSql, onAsk }: Props) {
  const s = useStyles()
  const [open, setOpen] = useState(readOpen)
  const [tab, setTab] = useState<TabKey>('columns')
  // 先頭の行(タブを開いたときに読む。表を変えたら読み直す)
  const [rows, setRows] = useState<{ ref: string; columns: Column[]; rows: Row[] } | null>(null)
  const [rowsError, setRowsError] = useState('')
  const [rowsBusy, setRowsBusy] = useState(false)
  // 列の中身(「調べる」を押した列。表を変えたら消える)
  const [profile, setProfile] = useState<ColumnProfile | null>(null)
  const [profileBusy, setProfileBusy] = useState<string | null>(null)
  const [profileError, setProfileError] = useState('')

  const runProfile = async (column: string, confirm = false) => {
    setProfileBusy(column)
    setProfileError('')
    setTab('profile')
    const r = await RunApi.profile(refName, column, confirm)
    setProfileBusy(null)
    if (isFailure(r)) {
      setProfile(null)
      return setProfileError(r.error)
    }
    setProfile(r)
  }

  const toggle = () => {
    setOpen((v) => {
      try {
        window.localStorage.setItem(OPEN_KEY, v ? '0' : '1')
      } catch {
        // 覚えられない環境では、毎回開く
      }
      return !v
    })
  }

  const loadRows = async () => {
    setRowsBusy(true)
    setRowsError('')
    const r = await DevApi.preview(refName)
    setRowsBusy(false)
    if (isFailure(r)) setRowsError(r.error)
    else setRows({ ref: refName, columns: r.columns, rows: r.rows })
  }

  const isView = !!info && info.type !== 'TABLE'
  const profileHere = profile && profile.table === refName ? profile : null
  const shownTab: TabKey =
    !info ? 'columns' : (tab === 'view' && !info.view_sql) || (tab === 'sources' && !info.sources.length) || (tab === 'profile' && !profileHere && !profileBusy && !profileError) ? 'columns' : tab
  const rowsHere = rows && rows.ref === refName ? rows : null

  return (
    <div className={s.card}>
      <div className={s.head}>
        <button type="button" className={s.toggle} onClick={toggle} title={open ? '畳む' : '開く'}>
          {open ? <ChevronDownRegular /> : <ChevronRightRegular />}
          {isView ? <EyeRegular /> : <TableRegular />}
          <span className={s.name} title={refName}>
            {refName}
          </span>
          {info && isView && (
            <Badge size="small" appearance="tint" color="informative">
              ビュー
            </Badge>
          )}
        </button>
        <CopyButton label="場所" title="`プロジェクト.データセット.表` をコピー" text={() => `\`${refName}\``} />
        {info && <CopyButton label="列の一覧" title="AI・Claude に渡す形(Markdown の表)でコピー" text={() => columnsMarkdown(info.ref, info.columns, info.description)} />}
        <Button size="small" appearance="subtle" icon={<PlayRegular />} onClick={() => onUseSql(`SELECT *\nFROM \`${refName}\`\nLIMIT 20`)} title="SELECT * … LIMIT 20 を SQL の欄に入れる">
          SQL へ
        </Button>
      </div>
      {loading && <Spinner size="tiny" label="表を読んでいます" />}
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {open && info && (
        <>
          <div className={s.facts}>
            <span>
              <span className={s.key}>行数</span>
              {info.rows?.toLocaleString() ?? '—'}
            </span>
            <span>
              <span className={s.key}>大きさ</span>
              {bytesLabel(info.bytes)}
            </span>
            <span>
              <span className={s.key}>最終更新</span>
              {info.modified ? new Date(info.modified).toLocaleString('ja-JP') : '—'}
            </span>
            <span>
              <span className={s.key}>場所</span>
              {info.location ?? '—'}
            </span>
            <span>
              <span className={s.key}>パーティション</span>
              {info.partitioning ? `${info.partitioning.field}(${info.partitioning.type})` : 'なし'}
            </span>
            {info.clustering.length > 0 && (
              <span>
                <span className={s.key}>クラスタ</span>
                {info.clustering.join(', ')}
              </span>
            )}
          </div>
          {info.description && <div className={s.desc}>{info.description}</div>}
          <TabList size="small" selectedValue={shownTab} onTabSelect={(_, d) => {
            setTab(d.value as TabKey)
            if (d.value === 'rows' && !rowsHere && !isView) void loadRows()
          }}>
            <Tab value="columns">列 {info.columns.length}</Tab>
            {(profileHere || profileBusy || profileError) && <Tab value="profile">列の中身{profileHere ? `: ${profileHere.column}` : ''}</Tab>}
            <Tab value="rows" disabled={isView} title={isView ? 'ビューは、SQL の欄で SELECT を流して見てください' : '料金はかかりません'}>
              先頭の行
            </Tab>
            {info.view_sql && <Tab value="view">ビューの SQL</Tab>}
            {info.sources.length > 0 && <Tab value="sources">参照している表 {info.sources.length}</Tab>}
          </TabList>
          <div className={s.body}>
            {shownTab === 'columns' && (
              <table className={s.cols}>
                <thead>
                  <tr>
                    <th className={s.th}>列</th>
                    <th className={s.th}>型</th>
                    <th className={s.th}>モード</th>
                    <th className={s.th}>説明</th>
                    <th className={s.th} />
                  </tr>
                </thead>
                <tbody>
                  {info.columns.map((c) => (
                    <tr key={c.name}>
                      <td className={mergeClasses(s.td, s.mono)}>{c.name}</td>
                      <td className={mergeClasses(s.td, s.mono)}>{c.type}</td>
                      <td className={mergeClasses(s.td, s.mono)}>{c.mode}</td>
                      <td className={s.td}>{c.description}</td>
                      <td className={s.td}>
                        {c.type !== 'RECORD' && c.type !== 'STRUCT' && (
                          <Button size="small" appearance="subtle" disabled={!!profileBusy} onClick={() => void runProfile(c.name)} title="空の数・値の種類・最小・最大・よく出る値を調べる(この列を全件読む。多いときは先に確かめる)">
                            {profileBusy === c.name ? '調べています…' : '調べる'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {shownTab === 'profile' && (
              <>
                {profileBusy && <Spinner size="tiny" label={`${profileBusy} を調べています`} />}
                {profileError && (
                  <MessageBar intent="error" layout="multiline">
                    <MessageBarBody>{profileError}</MessageBarBody>
                  </MessageBar>
                )}
                {profileHere && !profileBusy && <ColumnProfileView profile={profileHere} onConfirm={() => void runProfile(profileHere.column, true)} onAsk={onAsk} />}
              </>
            )}
            {shownTab === 'rows' && (
              <>
                {rowsBusy && <Spinner size="tiny" label="読んでいます" />}
                {rowsError && (
                  <MessageBar intent="error" layout="multiline">
                    <MessageBarBody>{rowsError}</MessageBarBody>
                  </MessageBar>
                )}
                {rowsHere && <ResultGrid compact columns={rowsHere.columns} rows={rowsHere.rows} />}
              </>
            )}
            {shownTab === 'view' && (
              <>
                <div className={s.row}>
                  <CopyButton text={() => info.view_sql} />
                  <Button size="small" appearance="subtle" onClick={() => onUseSql(info.view_sql)}>
                    SQL の欄に入れる
                  </Button>
                </div>
                <pre className={s.sql}>{info.view_sql}</pre>
              </>
            )}
            {shownTab === 'sources' && (
              <>
                <span className={s.muted}>このビューが読んでいる元の表(ビューの中のビューもたどった結果)。押すと開きます。</span>
                <div className={mergeClasses(s.row)}>
                  {info.sources.map((r) => (
                    <Button key={r} size="small" appearance="secondary" title={r} onClick={() => onOpenTable(r)}>
                      {r.split('.').slice(-2).join('.')}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
