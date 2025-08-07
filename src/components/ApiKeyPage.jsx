import React, { useState } from 'react';
import axios from 'axios';

export default function ApiKeyPage({ onConnect }) {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');

  const validateKey = async (key) => {
    try {
      const resp = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'system', content: 'Ping' }],
          max_tokens: 1,
          temperature: 0,
        },
        { headers: { Authorization: `Bearer ${key}` } }
      );
      return resp.status === 200;
    } catch (err) {
      return false;
    }
  };

  const handleSubmit = async () => {
    setError('');
    const key = apiKey.trim();
    if (!key) {
      setError('Please enter a valid API key');
      return;
    }
    const ok = await validateKey(key);
    if (ok) {
      // Clear any old chat history before proceeding
      localStorage.removeItem('chatHistory');
      sessionStorage.setItem('OPENAI_API_KEY', key);
      onConnect();
    } else {
      setError('API key invalid or request failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f7fa] font-sans">
      <div className="relative bg-white w-[520px] rounded-2xl shadow-2xl p-10 overflow-hidden mx-auto">
        {/* Top gradient bar */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-blue-400 rounded-tl-lg rounded-tr-lg"></div>

        {/* Decorations */}
        <div className="absolute -top-24 -right-24 w-[200px] h-[200px] bg-gradient-to-br from-blue-400/10 to-blue-600/5 rounded-full"></div>
        <div className="absolute -bottom-20 -left-20 w-[150px] h-[150px] bg-gradient-to-br from-blue-400/10 to-blue-600/5 rounded-full"></div>

        {/* Logo */}
        <div className="flex items-center justify-center text-blue-600 mb-6 gap-2">
          <i className="ri-robot-line text-3xl"></i>
          <h2 className="text-3xl font-bold">Career Assistant</h2>
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-blue-900 text-center mb-4">Enter Your OpenAI API Key</h1>

        {/* Description */}
        <p className="text-center text-gray-600 mb-8 leading-relaxed">
          To use our career assistance chatbot, please provide your OpenAI API key. This enables our AI to help with resume reviews, interview preparation, and job search strategies.
        </p>

        {/* Error Message */}
        {error && <p className="text-center text-red-500 mb-4">{error}</p>}

        {/* Input */}
        <div className="mb-6">
          <label htmlFor="api-key" className="block text-sm font-medium text-gray-600 mb-2">OpenAI API Key</label>
          <input
            id="api-key"
            type="password"
            placeholder="sk-..."
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {/* Button */}
        <button
          onClick={handleSubmit}
          className="w-full py-3 mb-6 bg-gradient-to-r from-blue-600 to-blue-400 text-white font-medium rounded-lg hover:from-blue-700 hover:to-blue-500 transition"
        >
          Connect API Key
        </button>

        {/* Privacy Note */}
        <div className="flex items-center justify-center text-center">
          <i className="ri-shield-check-line text-blue-600 mr-2"></i>
          <p className="text-xs text-gray-500">
            The backend service is stateless so we do not store your API key. If you still have concerns, run locally.
          </p>
        </div>
      </div>
    </div>
  );
}