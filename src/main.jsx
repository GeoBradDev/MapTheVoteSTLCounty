import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// An error caught by the app's error boundary (#18) is not logged: its text
// could hold what the page had, and the app logs nothing (#20).
createRoot(document.getElementById('root'), { onCaughtError: () => {} }).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
