import { makeStyles, tokens } from '@fluentui/react-components'
import type { PushSpec } from './templates'

const useStyles = makeStyles({
  // スマートフォンのロック画面に、通知が 1 つ出ている見取り図
  phone: {
    boxSizing: 'border-box',
    borderRadius: '14px',
    border: `3px solid ${tokens.colorNeutralForeground3}`,
    background: 'linear-gradient(165deg, #3b4a6b, #1d2438 70%)',
    padding: '18px 6px 10px',
    display: 'grid',
    alignContent: 'start',
  },
  note: { display: 'grid', rowGap: '3px', padding: '5px', borderRadius: '8px', backgroundColor: 'rgba(250,250,252,0.9)' },
  head: { display: 'flex', alignItems: 'center', columnGap: '3px' },
  icon: { width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#222' },
  bar: { height: '4px', borderRadius: '2px', backgroundColor: '#9aa0aa' },
  title: { height: '5px', width: '70%', borderRadius: '2px', backgroundColor: '#333' },
  body: { height: '4px', borderRadius: '2px', backgroundColor: '#888' },
  image: { aspectRatio: '16 / 9', borderRadius: '4px', backgroundColor: '#c9b8a6' },
  buttons: { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '3px' },
  button: { height: '8px', borderRadius: '3px', backgroundColor: '#d6d6dc' },
})

/** アプリのテンプレートの見取り図(通知の形)。テンプレートの一覧と、管理画面で使う */
export function PushThumb({ spec, width = 120 }: { spec: PushSpec; width?: number }) {
  const s = useStyles()
  const text = (
    <>
      <div className={s.title} />
      <div className={s.body} />
      <div className={s.body} style={{ width: '60%' }} />
    </>
  )
  return (
    <div className={s.phone} style={{ width, minHeight: width * 1.3 }} aria-hidden>
      <div className={s.note}>
        <div className={s.head}>
          <span className={s.icon} />
          <span className={s.bar} style={{ width: '30%' }} />
        </div>
        {text}
        {spec.image && <div className={s.image} />}
        {spec.buttons.length > 0 && (
          <div className={s.buttons}>
            {spec.buttons.map((b) => (
              <div key={b} className={s.button} title={b} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
