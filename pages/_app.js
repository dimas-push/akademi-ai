import '../styles/globals.css';
import { useEffect } from 'react';
import { registerSW, requestPermission, setupPeriodicSync } from '../lib/notify';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    (async () => {
      const reg = await registerSW();
      if (!reg) return;
      const granted = await requestPermission();
      if (granted) await setupPeriodicSync(reg);
    })();
  }, []);

  return <Component {...pageProps} />;
}
