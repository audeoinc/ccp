// 使える機能(X87 段 ①。⚙ の「開発・管理」)。機能の一覧(features.ts)を 大 / 中 / 小 の木で並べ、行ごとに公開・非公開を切り替える。
// 上に「版を選んで、まとめて当てる」(版はまとめて切り替える近道。当てたあとも 1 行ずつ変えられる)と、行のない機能の扱い('*')。
// 変えられるのは、開発者か管理者だけ(ほかの人は読むだけ)。データは消さない(非公開にしても、公開に戻せば元のまま見える)
import { useMemo, useState, useSyncExternalStore } from 'react'
import { Badge, Button, InfoLabel, MessageBar, MessageBarBody, SearchBox, Select, Spinner, Switch, Tree, TreeItem, TreeItemLayout, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { LockClosedRegular } from '@fluentui/react-icons'
import { FEATURES, FEATURE_AREAS, FEATURE_GROUPS, VERSION_ORDER, type FeatureDef, type FeatureVersion } from './features'
import { DEFAULT_KEY, hasSetting, isDeveloper, isPublic, reloadFeatureSettings, setViewingAsUser, settingOf, settingRowId, settingsLoaded, useFeatureVersion, viewingAsUser } from './featureFlags'
import { FeatureSettingsService } from './data/featureSettings'
import { confirmDialog } from './confirm'
import { myName, myUserId, onMeChange } from './history'
import { usePeople } from './people'
import { tr, useT } from './i18n'
import { typo } from './typo'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '12px', minWidth: 0 },
  bar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '12px', rowGap: '8px', padding: '10px 12px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
  grow: { flexGrow: 1 },
  label: typo.label,
  note: typo.caption,
  row: { display: 'flex', alignItems: 'center', columnGap: '8px', minWidth: 0 },
  id: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  off: { color: tokens.colorNeutralForeground3 },
  warn: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteDarkOrangeForeground1 },
  aside: { display: 'flex', alignItems: 'center', columnGap: '6px' },
})

const versionName = (v: FeatureVersion) =>
  v === 'always' ? tr('常時', 'Always') : v === 'dev' ? tr('開発者だけ', 'Developers only') : v === 'FULL' ? 'FULL' : v

/** 版を当てたときに、その機能を公開にするか(選んだ版までを公開。常時は行を書かない・開発者だけは非公開) */
const onInVersion = (f: FeatureDef, upTo: FeatureVersion) => f.version !== 'dev' && VERSION_ORDER.indexOf(f.version) <= VERSION_ORDER.indexOf(upTo)

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
  const [applyTo, setApplyTo] = useState<FeatureVersion>('MVP')

  const write = async (id: string, enabled: boolean) => {
    const rowId = settingRowId(id)
    const fields = { feature_id: id, enabled: enabled ? 1 : 0, changed_by: myName() || undefined }
    const r = rowId ? await FeatureSettingsService.update(rowId, fields) : await FeatureSettingsService.create(fields)
    if (!r.success) throw new Error(r.error?.message ?? tr('保存できませんでした', 'Could not save'))
  }
  const run = async (f: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await f()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      await reloadFeatureSettings()
      setBusy(false)
    }
  }

  const toggle = async (id: string, on: boolean, f?: FeatureDef) => {
    // 前提の機能が非公開なのに公開にしようとしたら、知らせる(決めるのは人)
    if (on && f?.requires?.length) {
      const missing = f.requires.filter((r) => !isPublic(r))
      if (missing.length) {
        const names = missing.map((r) => FEATURES.find((x) => x.id === r)?.label() ?? r).join('、')
        if (!(await confirmDialog(tr(`前提の機能(${names})が非公開です。それでも公開にしますか?`, `Its prerequisite (${names}) is not public. Make it public anyway?`), { okLabel: tr('公開にする', 'Make public') }))) return
      }
    }
    void run(() => write(id, on))
  }

  const applyVersion = async () => {
    if (!(await confirmDialog(tr(`「${versionName(applyTo)}」までの機能を公開にし、ほかを非公開にします。行のない機能(これから足す機能)も非公開になります。よいですか?`, `Make features up to "${versionName(applyTo)}" public and the rest not public. Features without a setting (added later) also become not public. Continue?`), { okLabel: tr('当てる', 'Apply') }))) return
    void run(async () => {
      // 中・大は公開にしておく(子を行ごとに決めるため。親で止めると、子の設定が効かない)
      for (const g of [...FEATURE_AREAS, ...FEATURE_GROUPS]) await write(g.id, true)
      for (const f of FEATURES) if (f.version !== 'always') await write(f.id, onInVersion(f, applyTo))
      await write(DEFAULT_KEY, false)
    })
  }

  const q = query.trim().toLowerCase()
  const hit = (f: FeatureDef) => !q || f.id.toLowerCase().includes(q) || f.label().toLowerCase().includes(q)
  const shownCount = useMemo(() => FEATURES.filter(hit).length, [q]) // eslint-disable-line react-hooks/exhaustive-deps -- 文言は言語で変わるが、数は変わらない

  const stateBadge = (id: string, f?: FeatureDef) => {
    if (f?.version === 'always')
      return (
        <Badge appearance="tint" color="informative" size="small" icon={<LockClosedRegular />}>
          {t('常時', 'Always')}
        </Badge>
      )
    if (f?.version === 'dev')
      return (
        <Badge appearance="tint" color="subtle" size="small">
          {t('開発者だけ', 'Developers only')}
        </Badge>
      )
    const pub = isPublic(id)
    return (
      <Badge appearance="tint" color={pub ? 'success' : 'subtle'} size="small">
        {pub ? t('公開', 'Public') : settingOf(id) ? t('非公開(親)', 'Hidden (parent)') : t('非公開', 'Not public')}
      </Badge>
    )
  }
  const switchOf = (id: string, f?: FeatureDef) =>
    f && (f.version === 'always' || f.version === 'dev') ? null : (
      <Switch checked={settingOf(id)} disabled={busy || !canEdit} aria-label={t('公開する', 'Public')} onChange={(_, d) => void toggle(id, d.checked, f)} />
    )
  const defaultNote = (id: string) => (!hasSetting(id) ? <span className={s.note}>{t('(既定)', '(default)')}</span> : null)

  if (!settingsLoaded()) return <Spinner size="tiny" />
  return (
    <div className={s.root}>
      {!canEdit && (
        <MessageBar intent="info" layout="multiline">
          <MessageBarBody>{t('変えられるのは、開発者か管理者だけです(⚙ の「ユーザーと承認グループ」で、開発者の印を付けます)。', 'Only developers and admins can change these (mark developers in ⚙ → Users and approval groups).')}</MessageBarBody>
        </MessageBar>
      )}
      <div className={s.bar}>
        <InfoLabel size="small" info={t('選んだ版までの機能を公開にし、ほかを非公開にします。当てたあとも、1 行ずつ変えられます。', 'Makes features up to the chosen version public and the rest not public. You can still change each row afterward.')}>
          {t('版を選んで、まとめて当てる', 'Apply a version')}
        </InfoLabel>
        <Select size="small" value={applyTo} onChange={(_, d) => setApplyTo(d.value as FeatureVersion)} aria-label={t('版', 'Version')}>
          {VERSION_ORDER.filter((v) => v !== 'always').map((v) => (
            <option key={v} value={v}>{versionName(v)}</option>
          ))}
        </Select>
        <Button size="small" appearance="primary" disabled={busy || !canEdit} onClick={() => void applyVersion()}>
          {t('当てる', 'Apply')}
        </Button>
        <span className={s.grow} />
        <InfoLabel size="small" info={t('features.ts に足したばかりで、まだ行のない機能の扱い。はじめは公開(いまの見え方を変えないため)。版を当てると非公開になり、そのあと足した機能は黙って出ません。', 'How features without a setting row are treated. Public at first (so nothing changes). Applying a version turns this off, so features added later stay hidden.')}>
          {t('設定のない機能', 'Features without a setting')}
        </InfoLabel>
        <Switch checked={settingOf(DEFAULT_KEY)} disabled={busy || !canEdit} label={settingOf(DEFAULT_KEY) ? t('公開', 'Public') : t('非公開', 'Not public')} onChange={(_, d) => void run(() => write(DEFAULT_KEY, d.checked))} />
      </div>
      {/* 開発者には非公開の機能も出るので、一般の人の見え方を確かめるときに切り替える(ブラウザごとに覚える) */}
      {developer && (
        <div className={s.row}>
          <Switch checked={viewingAsUser()} label={t('一般の人として見る(非公開の機能を隠す)', 'View as a general user (hide features that are not public)')} onChange={(_, d) => setViewingAsUser(d.checked)} />
        </div>
      )}
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      <div className={s.row}>
        <SearchBox size="small" value={query} onChange={(_, d) => setQuery(d.value)} placeholder={t('機能の名前・ID で探す', 'Search by name or ID')} />
        <span className={s.note}>{t(`${shownCount} / ${FEATURES.length} 件`, `${shownCount} / ${FEATURES.length}`)}</span>
        {busy && <Spinner size="extra-tiny" />}
      </div>
      <Tree aria-label={t('使える機能', 'Features')} defaultOpenItems={FEATURE_AREAS.map((a) => a.id)} size="small">
        {FEATURE_AREAS.map((a) => {
          const groups = FEATURE_GROUPS.filter((g) => g.area === a.id && FEATURES.some((f) => f.group === g.id && hit(f)))
          if (groups.length === 0) return null
          return (
            <TreeItem key={a.id} itemType="branch" value={a.id} open={q ? true : undefined}>
              <TreeItemLayout aside={<span className={s.aside}>{defaultNote(a.id)}{stateBadge(a.id)}{switchOf(a.id)}</span>}>{a.label()}</TreeItemLayout>
              <Tree>
                {groups.map((g) => (
                  <TreeItem key={g.id} itemType="branch" value={g.id} open={q ? true : undefined}>
                    <TreeItemLayout aside={<span className={s.aside}>{defaultNote(g.id)}{stateBadge(g.id)}{switchOf(g.id)}</span>}>{g.label()}</TreeItemLayout>
                    <Tree>
                      {FEATURES.filter((f) => f.group === g.id && hit(f)).map((f) => {
                        const missing = isPublic(f.id) ? (f.requires ?? []).filter((r) => !isPublic(r)) : []
                        return (
                          <TreeItem key={f.id} itemType="leaf" value={f.id}>
                            <TreeItemLayout
                              aside={
                                <span className={s.aside}>
                                  {/* 常時・開発者だけは、状態の札がそのまま版を表すので、版の札を重ねない */}
                                  {f.version !== 'always' && f.version !== 'dev' && (
                                    <>
                                      {defaultNote(f.id)}
                                      <Badge appearance="outline" size="small">{versionName(f.version)}</Badge>
                                    </>
                                  )}
                                  {stateBadge(f.id, f)}
                                  {switchOf(f.id, f)}
                                </span>
                              }
                            >
                              <span className={mergeClasses(s.row, !isPublic(f.id) && f.version !== 'always' && s.off)}>
                                {f.label()}
                                <span className={s.id}>{f.id}</span>
                                {missing.length > 0 && (
                                  <span className={s.warn}>
                                    {t(`前提が非公開: ${missing.join('、')}`, `Prerequisite not public: ${missing.join(', ')}`)}
                                  </span>
                                )}
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
    </div>
  )
}
