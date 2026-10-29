// 使える機能(X87。⚙ の「開発・管理」。3.1 の作り替え 2026-10-29)。機能の一覧(features.ts)を 大 / 中 / 小 の木で並べる。
// - 上に「版」の一覧: 版(MVP〜v4)ごとに公開 / 非公開を切り替える。止めている・先に出している数も出す(戻し忘れを防ぐ)。
// - 行ごと: 版の付け替え(コードの値と違えば「付け替え済み」と「コードの版に戻す」)と、上書き(版に従う / 止める / 先に出す。止める・先に出すは理由を書く)。
// - 止める・版を非公開にする前に、それを前提にしている機能・中の機能も隠れることを知らせる。変えたことは記録(だれ・いつ・何を・なぜ)に残す。
// 変えられるのは、開発者か管理者だけ(ほかの人は読むだけ)。データは消さない(止めても、戻せば元のまま見える)
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  MessageBar,
  MessageBarBody,
  SearchBox,
  Select,
  Spinner,
  Switch,
  Textarea,
  Tooltip,
  Tree,
  TreeItem,
  TreeItemLayout,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import { ArrowUndoRegular, LockClosedRegular } from '@fluentui/react-icons'
import { FEATURES, FEATURE_AREAS, FEATURE_GROUPS, VERSION_ORDER, type FeatureDef, type FeatureVersion } from './features'
import {
  isDeveloper,
  isPublic,
  modeOf,
  overrideOf,
  reloadFeatureSettings,
  retargeted,
  setViewingAsUser,
  settingsLoaded,
  useFeatureVersion,
  versionCounts,
  versionOf,
  versionPublished,
  versionRowId,
  viewingAsUser,
} from './featureFlags'
import { FeatureSettingsService } from './data/featureSettings'
import { FeatureVersionsService } from './data/featureVersions'
import { FeatureLogsService } from './data/featureLogs'
import type { FeatureMode, FeatureSettingFields } from './models/featureSettings'
import type { FeatureLog, FeatureLogFields } from './models/featureLogs'
import { confirmDialog } from './confirm'
import { myName, myUserId, onMeChange } from './history'
import { usePeople } from './people'
import { locale, tr, useT } from './i18n'
import { fuzzyMatch, splitByHits, termsOf, type Match } from './fuzzySearch'
import { typo } from './typo'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '12px', minWidth: 0 },
  versions: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  version: { display: 'grid', rowGap: '2px', padding: '8px 12px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground2, minWidth: '150px' },
  versionHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', columnGap: '8px', fontWeight: tokens.fontWeightSemibold },
  label: typo.label,
  note: typo.caption,
  row: { display: 'flex', alignItems: 'center', columnGap: '8px', minWidth: 0, flexWrap: 'wrap' },
  id: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  off: { color: tokens.colorNeutralForeground3 },
  warn: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteDarkOrangeForeground1 },
  aside: { display: 'flex', alignItems: 'center', columnGap: '6px' },
  select: { minWidth: '96px' },
  hit: { fontWeight: tokens.fontWeightBold, color: tokens.colorBrandForeground1 },
  log: { display: 'grid', gridTemplateColumns: 'auto auto minmax(0, 1fr)', columnGap: '12px', rowGap: '4px', fontSize: tokens.fontSizeBase200, alignItems: 'baseline' },
})

const PUBLISHABLE = VERSION_ORDER.filter((v) => v !== 'always')
const versionName = (v: FeatureVersion) => (v === 'always' ? tr('常時', 'Always') : v === 'dev' ? tr('開発者だけ', 'Developers only') : v)
const modeName = (m: FeatureMode) => (m === 'stop' ? tr('止める', 'Stop') : m === 'early' ? tr('先に出す', 'Release early') : tr('版に従う', 'Follow version'))
const nameOf = (id: string) => FEATURES.find((f) => f.id === id)?.label() ?? FEATURE_GROUPS.find((g) => g.id === id)?.label() ?? FEATURE_AREAS.find((a) => a.id === id)?.label() ?? id

/** その機能を止めたら、一緒に見えなくなるもの(前提にしている機能・中や大なら、その下の機能)。いま公開のものだけ */
function affectedBy(id: string): string[] {
  const under = FEATURES.filter((f) => f.group === id || FEATURE_GROUPS.some((g) => g.id === f.group && g.area === id))
  const dependents = FEATURES.filter((f) => f.requires?.includes(id))
  return [...under, ...dependents].filter((f) => f.id !== id && isPublic(f.id)).map((f) => f.id)
}

/** 理由を書いて、止める・先に出す(2026-10-29 利用者: だれが・いつ・なぜ を残す) */
interface Pending {
  id: string
  mode: Exclude<FeatureMode, 'follow'>
}

export function FeaturesManager() {
  const s = useStyles()
  const t = useT()
  useFeatureVersion()
  const people = usePeople()
  const meId = useSyncExternalStore(onMeChange, myUserId)
  const me = people.users.find((u) => u.id === meId)
  const canEdit = !!me && (me.role === 'admin' || me.is_developer === 1)
  const developer = isDeveloper()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [reason, setReason] = useState('')
  const [logs, setLogs] = useState<FeatureLog[] | null>(null)
  const [logTick, setLogTick] = useState(0)

  useEffect(() => {
    let alive = true
    void FeatureLogsService.getAll({ orderBy: ['created_on desc'], top: 100 }).then((r) => {
      if (alive && r.success) setLogs(r.data ?? [])
    })
    return () => {
      alive = false
    }
  }, [logTick])

  const actor = () => myName() || undefined
  const writeLog = (fields: Omit<FeatureLogFields, 'actor'>) => FeatureLogsService.create({ ...fields, actor: actor() })
  /** 上書きの行を書く(なければ作る) */
  const writeOverride = async (id: string, patch: Partial<FeatureSettingFields>) => {
    const row = overrideOf(id)
    const fields = { ...patch, changed_by: actor() }
    const r = row ? await FeatureSettingsService.update(row.id, fields) : await FeatureSettingsService.create({ feature_id: id, mode: 'follow', ...fields })
    if (!r.success) throw new Error(r.error?.message ?? tr('保存できませんでした', 'Could not save'))
  }
  const run = async (f: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await f()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      await reloadFeatureSettings()
      setLogTick((n) => n + 1)
      setBusy(false)
    }
  }

  /** 版を公開 / 非公開にする。非公開にする前に、ほかの版の機能で、前提が隠れるものを知らせる */
  const setVersion = async (v: FeatureVersion, on: boolean) => {
    if (!on) {
      const inVersion = new Set(FEATURES.filter((f) => versionOf(f) === v && modeOf(f.id) !== 'early').map((f) => f.id))
      const broken = FEATURES.filter((f) => !inVersion.has(f.id) && isPublic(f.id) && f.requires?.some((r) => inVersion.has(r)))
      const note = broken.length ? tr(`\nこの版の機能を前提にしている、ほかの版の機能(${broken.map((f) => f.label()).join('、')})も使えなくなります。`, `\nFeatures in other versions that rely on it (${broken.map((f) => f.label()).join(', ')}) will stop working too.`) : ''
      if (!(await confirmDialog(tr(`${v} を非公開にします。この版の機能(${versionCounts(v).total})が、一般の人に見えなくなります(先に出しているものは除く)。${note}`, `Make ${v} not public. Its ${versionCounts(v).total} features will be hidden from general users (except ones released early).${note}`), { okLabel: tr('非公開にする', 'Make not public') }))) return
    }
    void run(async () => {
      const rowId = versionRowId(v)
      const fields = { version: v, published: on ? 1 : 0, changed_by: actor() }
      const r = rowId ? await FeatureVersionsService.update(rowId, fields) : await FeatureVersionsService.create(fields)
      if (!r.success) throw new Error(r.error?.message ?? tr('保存できませんでした', 'Could not save'))
      await writeLog({ feature_id: `version:${v}`, action: on ? 'publish' : 'unpublish', before_value: on ? '0' : '1', after_value: on ? '1' : '0' })
    })
  }

  /** 版を付け替える(コードの値に戻すときは空にする) */
  const retarget = (f: FeatureDef, v: FeatureVersion) =>
    void run(async () => {
      const before = versionOf(f)
      await writeOverride(f.id, { version: v === f.version ? '' : v })
      await writeLog({ feature_id: f.id, action: 'retarget', before_value: before, after_value: v })
    })

  /** 上書きを変える。止める・先に出すは、理由を書く窓を開く */
  const changeMode = (id: string, mode: FeatureMode) => {
    if (mode === 'follow')
      return void run(async () => {
        const before = modeOf(id)
        await writeOverride(id, { mode: 'follow', reason: '' })
        await writeLog({ feature_id: id, action: 'follow', before_value: before, after_value: 'follow' })
      })
    setReason('')
    setPending({ id, mode })
  }
  const confirmPending = () => {
    if (!pending) return
    const { id, mode } = pending
    setPending(null)
    void run(async () => {
      const before = modeOf(id)
      await writeOverride(id, { mode, reason: reason.trim() })
      await writeLog({ feature_id: id, action: mode, before_value: before, after_value: mode, reason: reason.trim() })
    })
  }

  // あいまいな検索(fuzzySearch.ts)。名前(日本語・英語)・ID・親(中・大)の名前のどれに当たってもよい。当たり具合の順に並べ、当たった行の親は開く
  const terms = useMemo(() => termsOf(query), [query])
  const searching = terms.length > 0
  const matches = useMemo(() => {
    const m = new Map<string, Match>()
    for (const f of FEATURES) {
      const g = FEATURE_GROUPS.find((x) => x.id === f.group)
      const a = FEATURE_AREAS.find((x) => x.id === g?.area)
      const r = fuzzyMatch(terms, [
        { text: f.names[0], weight: 10 },
        { text: f.names[1], weight: 8 },
        { text: f.id, weight: 6 },
        { text: g?.names[0] ?? '', weight: 3 },
        { text: g?.names[1] ?? '', weight: 3 },
        { text: a?.names[0] ?? '', weight: 2 },
        { text: a?.names[1] ?? '', weight: 2 },
      ])
      if (r) m.set(f.id, r)
    }
    return m
  }, [terms])
  const scoreOf = (id: string) => matches.get(id)?.score ?? 0
  const leavesOf = (groupId: string) => {
    const list = FEATURES.filter((f) => f.group === groupId && matches.has(f.id))
    return searching ? list.sort((x, y) => scoreOf(y.id) - scoreOf(x.id)) : list
  }
  const bestOf = (ids: string[]) => Math.max(0, ...ids.map(scoreOf))
  const groupsOf = (areaId: string) => {
    const list = FEATURE_GROUPS.filter((g) => g.area === areaId && leavesOf(g.id).length > 0)
    return searching ? list.sort((x, y) => bestOf(leavesOf(y.id).map((f) => f.id)) - bestOf(leavesOf(x.id).map((f) => f.id))) : list
  }
  const areas = searching ? [...FEATURE_AREAS].sort((x, y) => bestOf(FEATURES.filter((f) => groupsOf(y.id).some((g) => g.id === f.group)).map((f) => f.id)) - bestOf(FEATURES.filter((f) => groupsOf(x.id).some((g) => g.id === f.group)).map((f) => f.id))) : FEATURE_AREAS
  const marked = (text: string, ranges: [number, number][] | undefined) => splitByHits(text, ranges ?? []).map((p, i) => (p.hit ? <b key={i} className={s.hit}>{p.text}</b> : <span key={i}>{p.text}</span>))

  /** 状態の札(公開 / 非公開 / 止めている(理由)/ 先に出している) */
  const stateBadge = (id: string, f?: FeatureDef) => {
    const v = f && versionOf(f)
    if (v === 'always')
      return (
        <Badge appearance="tint" color="informative" size="small" icon={<LockClosedRegular />}>
          {t('常時', 'Always')}
        </Badge>
      )
    if (v === 'dev')
      return (
        <Badge appearance="tint" color="subtle" size="small">
          {t('開発者だけ', 'Developers only')}
        </Badge>
      )
    const mode = modeOf(id)
    const why = overrideOf(id)?.reason
    if (mode === 'stop')
      return (
        <Tooltip content={why || t('理由なし', 'No reason given')} relationship="description">
          <Badge appearance="filled" color="danger" size="small">{t('止めている', 'Stopped')}</Badge>
        </Tooltip>
      )
    if (mode === 'early')
      return (
        <Tooltip content={why || t('理由なし', 'No reason given')} relationship="description">
          <Badge appearance="filled" color="brand" size="small">{t('先に出している', 'Released early')}</Badge>
        </Tooltip>
      )
    const pub = isPublic(id)
    return (
      <Badge appearance="tint" color={pub ? 'success' : 'subtle'} size="small">
        {pub ? t('公開', 'Public') : f && !versionPublished(versionOf(f)) ? t('版が非公開', 'Version not public') : t('非公開(親)', 'Hidden (parent)')}
      </Badge>
    )
  }
  /** 上書きの選択(中・大は「止める」だけ) */
  const modeSelect = (id: string, leaf: boolean) => (
    <Select size="small" className={s.select} value={modeOf(id)} disabled={busy || !canEdit} aria-label={t('上書き', 'Override')} onChange={(_, d) => changeMode(id, d.value as FeatureMode)}>
      <option value="follow">{modeName('follow')}</option>
      <option value="stop">{modeName('stop')}</option>
      {leaf && <option value="early">{modeName('early')}</option>}
    </Select>
  )
  /** 版の付け替え(常時・開発者だけは付け替えない) */
  const versionSelect = (f: FeatureDef) => (
    <span className={s.aside}>
      {retargeted(f) && (
        <Tooltip content={t(`付け替え済み(コードでは ${versionName(f.version)})。押すとコードの版に戻す`, `Retargeted (code says ${versionName(f.version)}). Click to go back`)} relationship="description">
          <Button size="small" appearance="subtle" icon={<ArrowUndoRegular />} disabled={busy || !canEdit} onClick={() => retarget(f, f.version)}>
            {t('付け替え済み', 'Retargeted')}
          </Button>
        </Tooltip>
      )}
      <Select size="small" className={s.select} value={versionOf(f)} disabled={busy || !canEdit} aria-label={t('版', 'Version')} onChange={(_, d) => retarget(f, d.value as FeatureVersion)}>
        {PUBLISHABLE.map((v) => (
          <option key={v} value={v}>{versionName(v)}</option>
        ))}
      </Select>
    </span>
  )

  if (!settingsLoaded()) return <Spinner size="tiny" />
  const affected = pending ? affectedBy(pending.id) : []
  return (
    <div className={s.root}>
      {!canEdit && (
        <MessageBar intent="info" layout="multiline">
          <MessageBarBody>{t('変えられるのは、開発者か管理者だけです(⚙ の「ユーザーと承認グループ」で、開発者の印を付けます)。', 'Only developers and admins can change these (mark developers in ⚙ → Users and approval groups).')}</MessageBarBody>
        </MessageBar>
      )}
      {/* 版の一覧: 版をまとまりとして公開する。あとで版に足した・付け替えた機能も、版が公開ならついてくる */}
      <div className={s.versions}>
        {PUBLISHABLE.map((v) => {
          const c = versionCounts(v)
          return (
            <div key={v} className={s.version}>
              <span className={s.versionHead}>
                {v}
                <Switch checked={versionPublished(v)} disabled={busy || !canEdit} aria-label={t(`${v} を公開する`, `Publish ${v}`)} onChange={(_, d) => void setVersion(v, d.checked)} />
              </span>
              <span className={s.note}>
                {[versionPublished(v) ? t('公開', 'Public') : t('非公開', 'Not public'), t(`${c.total} 機能`, `${c.total} features`), c.stopped ? t(`${c.stopped} つ止めている`, `${c.stopped} stopped`) : '', c.early ? t(`${c.early} つ先に出している`, `${c.early} early`) : ''].filter(Boolean).join(' ・ ')}
              </span>
            </div>
          )
        })}
      </div>
      {/* 開発者には非公開の機能も出るので、一般の人の見え方を確かめるときに切り替える(ブラウザごとに覚える) */}
      {developer && <Switch checked={viewingAsUser()} label={t('一般の人として見る(非公開の機能を隠す)', 'View as a general user (hide features that are not public)')} onChange={(_, d) => setViewingAsUser(d.checked)} />}
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      <div className={s.row}>
        <SearchBox size="small" value={query} onChange={(_, d) => setQuery(d.value)} placeholder={t('機能の名前・ID で探す(うろ覚えでも)', 'Search by name or ID (fuzzy)')} />
        <span className={s.note}>{t(`${matches.size} / ${FEATURES.length} 件`, `${matches.size} / ${FEATURES.length}`)}</span>
        {busy && <Spinner size="extra-tiny" />}
      </div>
      <Tree aria-label={t('使える機能', 'Features')} defaultOpenItems={FEATURE_AREAS.map((a) => a.id)} size="small">
        {areas.map((a) => {
          const groups = groupsOf(a.id)
          if (groups.length === 0) return null
          return (
            <TreeItem key={a.id} itemType="branch" value={a.id} open={searching ? true : undefined}>
              <TreeItemLayout aside={<span className={s.aside}>{stateBadge(a.id)}{modeSelect(a.id, false)}</span>}>{a.label()}</TreeItemLayout>
              <Tree>
                {groups.map((g) => (
                  <TreeItem key={g.id} itemType="branch" value={g.id} open={searching ? true : undefined}>
                    <TreeItemLayout aside={<span className={s.aside}>{stateBadge(g.id)}{modeSelect(g.id, false)}</span>}>{g.label()}</TreeItemLayout>
                    <Tree>
                      {leavesOf(g.id).map((f) => {
                        const hits = matches.get(f.id)?.hits
                        const missing = isPublic(f.id) ? (f.requires ?? []).filter((r) => !isPublic(r)) : []
                        const locked = f.version === 'always' || f.version === 'dev'
                        return (
                          <TreeItem key={f.id} itemType="leaf" value={f.id}>
                            <TreeItemLayout
                              aside={
                                <span className={s.aside}>
                                  {!locked && versionSelect(f)}
                                  {stateBadge(f.id, f)}
                                  {!locked && modeSelect(f.id, true)}
                                </span>
                              }
                            >
                              <span className={mergeClasses(s.row, !isPublic(f.id) && !locked && s.off)}>
                                <span>{marked(f.label(), hits?.[f.label() === f.names[0] ? 0 : 1])}</span>
                                <span className={s.id}>{marked(f.id, hits?.[2])}</span>
                                {missing.length > 0 && <span className={s.warn}>{t(`前提が非公開: ${missing.join('、')}`, `Prerequisite not public: ${missing.join(', ')}`)}</span>}
                              </span>
                            </TreeItemLayout>
                          </TreeItem>
                        )
                      })}
                    </Tree>
                  </TreeItem>
                ))}
              </Tree>
            </TreeItem>
          )
        })}
      </Tree>
      {/* 記録(だれ・いつ・何を・なぜ)。ふだんは畳む */}
      <Accordion collapsible>
        <AccordionItem value="log">
          <AccordionHeader size="small">{t(`変えた記録(${logs?.length ?? 0})`, `Change log (${logs?.length ?? 0})`)}</AccordionHeader>
          <AccordionPanel>
            {logs === null ? (
              <Spinner size="tiny" />
            ) : logs.length === 0 ? (
              <span className={s.note}>{t('まだ記録はありません', 'No changes yet')}</span>
            ) : (
              <div className={s.log}>
                {logs.map((l) => (
                  <LogRow key={l.id} log={l} />
                ))}
              </div>
            )}
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
      {/* 止める・先に出すときの理由(不具合のときの流れ: 止める → 直して確かめる → 版に従うに戻す) */}
      <Dialog open={!!pending} onOpenChange={(_, d) => !d.open && setPending(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{pending ? t(`「${nameOf(pending.id)}」を${modeName(pending.mode)}`, `${modeName(pending.mode)}: ${nameOf(pending.id)}`) : ''}</DialogTitle>
            <DialogContent style={{ display: 'grid', rowGap: 10 }}>
              {pending?.mode === 'stop' && affected.length > 0 && (
                <MessageBar intent="warning" layout="multiline">
                  <MessageBarBody>{t(`一緒に見えなくなる機能があります: ${affected.map(nameOf).join('、')}`, `These will be hidden too: ${affected.map(nameOf).join(', ')}`)}</MessageBarBody>
                </MessageBar>
              )}
              <Field label={t('理由(記録に残ります)', 'Reason (kept in the log)')} required>
                <Textarea value={reason} onChange={(_, d) => setReason(d.value)} placeholder={pending?.mode === 'stop' ? t('例: 保存できない不具合のため、直るまで止める', 'e.g. A save bug; stop until fixed') : t('例: 一部の担当者に先に使ってもらうため', 'e.g. Let some team members try it first')} />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPending(null)}>{t('やめる', 'Cancel')}</Button>
              <Button appearance="primary" disabled={!reason.trim()} onClick={confirmPending}>
                {pending ? modeName(pending.mode) : ''}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}

/** 記録の 1 行(いつ・だれ・何を・なぜ) */
function LogRow({ log: l }: { log: FeatureLog }) {
  const t = useT()
  const what = l.feature_id.startsWith('version:') ? l.feature_id.slice('version:'.length) : nameOf(l.feature_id)
  const action =
    l.action === 'publish'
      ? t('公開にした', 'published')
      : l.action === 'unpublish'
        ? t('非公開にした', 'unpublished')
        : l.action === 'retarget'
          ? t(`版を ${l.before_value} → ${l.after_value}`, `version ${l.before_value} → ${l.after_value}`)
          : l.action === 'stop'
            ? t('止めた', 'stopped')
            : l.action === 'early'
              ? t('先に出した', 'released early')
              : t('版に従うに戻した', 'back to following its version')
  return (
    <>
      <span>{l.created_on ? new Date(l.created_on).toLocaleString(locale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
      <span>{l.actor || t('(名前なし)', '(no name)')}</span>
      <span>{`${what}: ${action}${l.reason ? t(`(理由: ${l.reason})`, ` (reason: ${l.reason})`) : ''}`}</span>
    </>
  )
}
