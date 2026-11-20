// The default theme, umlimator's brand colours, <umlimator-map> for the ```umlimator blocks, and
// the live diagram frames following the site's light/dark switch (client side only).
import DefaultTheme from 'vitepress/theme';
import '../../../lib/umlimator-theme.css';
import './custom.css';
import { followSiteTheme } from './frames.js';

export default {
  extends: DefaultTheme,
  enhanceApp() {
    if (!import.meta.env.SSR) { import('../../../lib/umlimator-element.js'); followSiteTheme(document); }
  },
};
