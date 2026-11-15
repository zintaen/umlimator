// The default theme, umlimator's brand colours, and <umlimator-map> for the ```umlimator blocks (client side only).
import DefaultTheme from 'vitepress/theme';
import '../../../lib/umlimator-theme.css';
import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp() {
    if (!import.meta.env.SSR) import('../../../lib/umlimator-element.js');
  },
};
