import { makeStyles, tokens } from '@fluentui/react-components'

// 画面の上の帯(AppToolbar)と App が一緒に使う、絞り込みの形と、面の切り替えのボタンの形

export interface Filters {
  country: string
  channel: string
  department: string
  status: string
  /** 担当(企画・制作のどちらかが、この名前の配信)。制作担当が、自分の配信だけを見る入り口にする(FLOWS.md の C-2) */
  person: string
}
export const noFilter: Filters = { country: '', channel: '', department: '', status: '', person: '' }

/** 面(計画・制作・結果)の切り替えのボタンの形。App の見せ方の切り替えも、同じ形にする */
export const useFaceButtonStyles = makeStyles({
  faceBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '6px',
    border: 'none',
    borderRadius: tokens.borderRadiusSmall,
    padding: `4px ${tokens.spacingHorizontalM}`,
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground2,
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  faceBtnOn: {
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
    boxShadow: tokens.shadow2,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1 },
  },
})

export type Page = 'calendar' | 'production' | 'results' | 'alerts'
