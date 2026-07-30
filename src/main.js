import './style.css';
import 'katex/dist/katex.min.css';
import { bootstrapApplication } from './application-controller.js';

try {
  const application = bootstrapApplication();
  window.addEventListener('pagehide', () => application.destroy(), { once: true });
  if (import.meta.hot) import.meta.hot.dispose(() => application.destroy());
} catch (error) {
  console.error('Chalk failed to start.', error);
  throw error;
}
