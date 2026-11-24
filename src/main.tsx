import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (
  'serviceWorker' in navigator &&
  (window.location.protocol === 'https:' || window.location.protocol === 'http:')
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      // Offline or dev environment without sw.js
    });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
