import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (
  import.meta.env.PROD &&
  'serviceWorker' in navigator &&
  (window.location.protocol === 'https:' || window.location.protocol === 'http:')
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      // Offline environment without sw.js
    });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
