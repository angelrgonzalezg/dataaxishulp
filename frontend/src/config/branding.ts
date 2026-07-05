/** Rutas de assets de marca DataAxis */
export const BRAND_ASSETS = {
  logoLogin: '/brand/logo-dataaxis.svg',
  logoWide: '/brand/logo-da-wide.svg',
  logoIcon: '/brand/logo-icon.svg',
} as const;

/** Paleta corporativa DataAxis (sincronizada con Thuiszorg_V2 / tailwind `brand`) */
export const BRAND_COLORS = {
  50: '#eef6fb',
  100: '#d6eaf5',
  200: '#b3d7ec',
  300: '#85bcdf',
  400: '#5199cc',
  500: '#357eb5',
  600: '#1c6796',
  700: '#185480',
  800: '#17466b',
  900: '#173b59',
  950: '#0f263b',
} as const;

export const DATAAXIS_BLUE = BRAND_COLORS[600];
