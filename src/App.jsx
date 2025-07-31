import React, { useState, useEffect } from 'react';
import ApiKeyPage from './components/ApiKeyPage';

function App() {
  const [apiKey, setApiKey] = useState(null);

  useEffect(() => {
    // Retrieve API key from sessionStorage to ensure it clears on browser close
    const key = sessionStorage.getItem('OPENAI_API_KEY');
    if (key) setApiKey(key);
  }, []);

  const handleConnect = () => {
    setApiKey(sessionStorage.getItem('OPENAI_API_KEY'));
  };

  // If no API key in sessionStorage, show entry page
  if (!apiKey) {
    return <ApiKeyPage onConnect={handleConnect} />;
  }

  return (
    <div>
      {/* Replace with ModeSelectPage once ready */}
      <p className="text-center mt-10">API Key connected! Proceed to mode selection.</p>
    </div>
  );
}

export default App;
