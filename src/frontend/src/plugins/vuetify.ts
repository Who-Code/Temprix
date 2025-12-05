import 'vuetify/styles';
import { createVuetify } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi';
import { VCalendar } from 'vuetify/components';

const temprixLight = {
  dark: false,
  colors: {
    primary: '#5D576B',
    secondary: '#9BC1BC',
    info: '#6C809A',
    success: '#7CB342',
    warning: '#F9A825',
    error: '#ED6A5A',
    background: '#E6EBE0',
    surface: '#FFFFFF',
  },
};

const vuetify = createVuetify({
  components: {
    VCalendar,
  },
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi },
  },
  theme: {
    defaultTheme: 'temprixLight',
    themes: { temprixLight },
  },
});

export default vuetify;
