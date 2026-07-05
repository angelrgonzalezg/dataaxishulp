import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { es } from './locales/es';
import { en } from './locales/en';
import { useLocaleStore } from '@/store/localeStore';

const locale = useLocaleStore.getState().locale;

void i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: locale,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

useLocaleStore.subscribe((state) => {
  void i18n.changeLanguage(state.locale);
});

export default i18n;
