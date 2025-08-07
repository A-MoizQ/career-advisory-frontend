import React, { useState, useEffect } from 'react';
import ApiKeyPage from './components/ApiKeyPage';
import ModeSelectPage from './components/ModeSelectPage';
import ChatPage from './components/ChatPage';

function App() {
  const [apiKey, setApiKey] = useState(null);
  const [mode, setMode] = useState(null);

  useEffect(() => {
    const key = sessionStorage.getItem('OPENAI_API_KEY');
    if (key) setApiKey(key);
  }, []);

  if (!apiKey) {
    return <ApiKeyPage onConnect={() => setApiKey(sessionStorage.getItem('OPENAI_API_KEY'))} />;
  }

  if (!mode) {
    return <ModeSelectPage onContinue={setMode} />;
  }

  return <ChatPage mode={mode} onModeChange={setMode} />;
}

export default App;
