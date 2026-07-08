import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// Bundled fonts so text is identical in preview and in the exported frames,
// with no network dependency at render time.
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/amiri/400.css'; // Arabic + the ﷺ glyph (U+FDFA)
import '@fontsource/amiri/700.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
