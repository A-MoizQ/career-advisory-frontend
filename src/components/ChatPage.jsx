import React, { useState, useEffect, useRef } from 'react';
import pdfToText from 'react-pdftotext';
import axios from 'axios';

const modeOptions = [
  'career_advice',
  'resume_review',
  'job_hunt',
  'learning_roadmap',
  'mock_interview'
];

export default function ChatPage({ mode, onModeChange }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState('');
  const containerRef = useRef(null);
  const API_KEY = sessionStorage.getItem('OPENAI_API_KEY');
  const MAX_HISTORY = 10; // max messages to keep in context

  // load history
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    setMessages(stored);
  }, []);

  // save history and scroll
  useEffect(() => {
    localStorage.setItem('chatHistory', JSON.stringify(messages));
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (file = null) => {
    const isFileMessage = Boolean(file);
    // If it's a text message, ensure there's text.
    if (!isFileMessage && !input.trim()) return;

    const userApiKey = sessionStorage.getItem('OPENAI_API_KEY');
    if (!userApiKey) {
      setApiKeyModalOpen(true);
      return;
    }

    // Add user's text message to the chat UI immediately
    if (!isFileMessage) {
      const userMsg = { role: 'user', content: input, time: new Date().toLocaleTimeString() };
      setMessages(prev => [...prev, userMsg].slice(-MAX_HISTORY));
    }
    
    // Prepare messages for the API call. Exclude the latest message if it's a file upload,
    // as the file content will be handled separately.
    const messagesForApi = messages.slice(-MAX_HISTORY).map(m => ({
      role: m.role,
      content: m.content
    }));

    // If it's a text message, add it to the API payload.
    if (!isFileMessage) {
      messagesForApi.push({ role: 'user', content: input });
    }

    setInput('');
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('api_key', userApiKey);
      formData.append('mode', mode);
      // Messages need to be stringified to be sent in a FormData object
      formData.append('messages', JSON.stringify(messagesForApi));
      
      if (isFileMessage) {
        formData.append('file', file);
      }

      const resp = await axios.post('/chat', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const botReply = resp.data.reply;
      const botMsg = { role: 'assistant', content: botReply, time: new Date().toLocaleTimeString() };
      setMessages(prev => [...prev, botMsg].slice(-MAX_HISTORY));
    } catch (error) {
      const errorDetail = error.response?.data?.detail;
      let errorMessage = 'Error: failed to get response from the server.';
      if (typeof errorDetail === 'string') {
        errorMessage = errorDetail;
      } else if (errorDetail?.error?.message) {
        errorMessage = errorDetail.error.message;
      }
      setMessages(prev => [...prev, { role: 'assistant', content: errorMessage, time: new Date().toLocaleTimeString() }].slice(-MAX_HISTORY));
    }
    setLoading(false);
  };


  const handleFileClick = () => {
    document.getElementById('file-input').click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      const errorMessage = `Sorry, only PDF files are supported for upload.`;
      const errorMsg = { role: 'assistant', content: errorMessage, time: new Date().toLocaleTimeString() };
      setMessages(prev => [...prev, errorMsg].slice(-MAX_HISTORY));
      return;
    }

    // Show a message in the chat that the file is being uploaded and processed
    const fileUploadMsg = { 
      role: 'user', 
      content: `Uploading "${file.name}" for review...`, 
      time: new Date().toLocaleTimeString() 
    };
    setMessages(prev => [...prev, fileUploadMsg].slice(-MAX_HISTORY));

    // Call handleSend with the file
    await handleSend(file);
  };

  const handleUpdateApiKey = () => {
    if (newApiKey.trim()) {
      sessionStorage.setItem('OPENAI_API_KEY', newApiKey.trim());
      setApiKeyModalOpen(false);
      setNewApiKey('');
      // Force page reload to update API_KEY constant
      window.location.reload();
    }
  };

  return (
    <div className="flex w-full h-full">
      {/* Sidebar */}
      <div className="w-60 bg-[#1a3a5f] text-white p-6 flex flex-col">
        <div className="flex items-center mb-10">
          <i className="ri-robot-line text-2xl mr-2" />
          <h2 className="text-lg font-medium">Career Assistant</h2>
        </div>
        <div className="text-sm opacity-70 mb-2">Current Mode</div>
        <div className="relative">
          <div onClick={() => setMenuOpen(!menuOpen)} className="bg-[#2d7ff9] bg-opacity-20 rounded-lg p-3 flex justify-between items-center mb-4 cursor-pointer hover:bg-opacity-30 transition-all duration-200">
            <span className="capitalize text-white font-medium">{mode.replace('_', ' ')}</span>
            <i className={`${menuOpen ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-white transition-transform duration-200`} />
          </div>
          {menuOpen && (
            <div className="absolute bg-white rounded-lg shadow-xl w-full z-10 border border-gray-200 overflow-hidden">
                {modeOptions.map((opt, index) => (
                <div 
                    key={opt} 
                    onClick={() => { onModeChange(opt); setMenuOpen(false); }} 
                    className={`py-3 cursor-pointer capitalize transition-all duration-200 font-medium border-l-4 ${
                    opt === mode 
                        ? 'bg-[#e6f2ff] text-[#2d7ff9] border-l-[#2d7ff9] font-semibold pl-3 pr-4' 
                        : 'text-gray-700 border-l-transparent px-4 hover:bg-[#2d7ff9] hover:text-white'
                    } ${index !== modeOptions.length - 1 ? 'border-b border-b-gray-100' : ''}`}
                >
                    {opt.replace('_', ' ')}
                </div>
                ))}
            </div>
        )}
        </div>
        <div className="mt-auto text-xs opacity-50 text-center">
          © 2025 Career Assistant AI<br />Version 1.0.0
        </div>
      </div>
      
      {/* Main Chat */}
      <div className="flex-1 flex flex-col bg-white">
        <div className="border-b p-5 flex items-center justify-between">
          <div className="flex items-center">
            <i className="ri-briefcase-4-line text-2xl text-[#2d7ff9] mr-3" />
            <h2 className="text-lg font-medium text-[#333] capitalize">{mode.replace('_', ' ')} Mode</h2>
          </div>
          <button 
            onClick={() => setApiKeyModalOpen(true)}
            className="flex items-center px-3 py-2 bg-[#2d7ff9] text-white rounded-lg hover:bg-[#1e5bb8] transition-all duration-200 text-sm font-medium"
            >
            <i className="ri-key-line text-lg mr-2" />
            Change API Key
          </button>
        </div>
        
        <div ref={containerRef} className="flex-1 p-5 overflow-y-auto flex flex-col space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`${m.role==='assistant'? 'self-start bg-[#f0f2f5] text-[#333]':'self-end bg-[#2d7ff9] text-white'} max-w-[70%] p-4 rounded-lg leading-relaxed mb-2`}> 
              {m.content}
              <span className={`block text-[11px] opacity-70 mt-2 ${m.role==='assistant'? 'text-left':'text-right'}`}>{m.time}</span>
            </div>
          ))}
          {loading && (
            <div className="self-start flex items-center p-3 bg-[#f0f2f5] rounded-lg">
              <div className="flex space-x-2">
                <span className="w-2 h-2 bg-[#2d7ff9] rounded-full animate-bounce"></span>
                <span className="w-2 h-2 bg-[#2d7ff9] rounded-full animate-bounce delay-150"></span>
                <span className="w-2 h-2 bg-[#2d7ff9] rounded-full animate-bounce delay-300"></span>
              </div>
            </div>
          )}
        </div>
        
        <div className="border-t p-4 flex items-center">
          <input id="file-input" type="file" className="hidden" onChange={handleFileChange} />
          <div className="flex-1 bg-[#f0f2f5] rounded-full px-4 py-2 flex items-center">
            <i onClick={handleFileClick} className="ri-attachment-2 text-xl text-[#2d7ff9] mr-3 cursor-pointer" />
            <input value={input} onChange={e => setInput(e.target.value)} className="flex-1 bg-transparent outline-none text-sm" placeholder="Type a message..." />
            <i className="ri-emotion-line text-xl text-[#2d7ff9] ml-3 cursor-pointer" />
          </div>
          <button onClick={handleSend} className="ml-4 bg-[#2d7ff9] w-10 h-10 rounded-full flex items-center justify-center text-white">
            <i className="ri-send-plane-fill text-lg" />
          </button>
        </div>
      </div>

      {/* API Key Modal */}
      {apiKeyModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-8 w-[480px] mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#1a1a1a]">Update API Key</h3>
              <button 
                onClick={() => setApiKeyModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <i className="ri-close-line text-2xl" />
              </button>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-[#666] mb-2">OpenAI API Key</label>
              <input
                type="password"
                value={newApiKey}
                onChange={e => setNewApiKey(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2d7ff9] focus:border-transparent outline-none transition-all"
                placeholder="sk-..."
              />
              <p className="text-xs text-gray-500 mt-2">
                Your API key is stored locally and never shared with third parties.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setApiKeyModalOpen(false)}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateApiKey}
                className="flex-1 py-3 bg-[#2d7ff9] text-white rounded-lg font-medium hover:bg-[#1e5bb8] transition-colors"
              >
                Update Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}