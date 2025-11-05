import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import apiClient from '../lib/apiClient';

const modeOptions = [
  'career_advice',
  'resume_review',
  'job_hunt',
  'learning_roadmap',
  'mock_interview',
];

const formatTime = () => new Date().toLocaleTimeString();

const formatWarnings = (warnings) =>
  warnings && warnings.length
    ? `⚠️ **Important notes:**\n${warnings.map((warning) => `- ${warning}`).join('\n')}`
    : '';

// Helper: robust file check
const isRealFile = (x) =>
  x instanceof File ||
  (x &&
    typeof x === 'object' &&
    typeof x.name === 'string' &&
    typeof x.size === 'number' &&
    typeof x.type === 'string');

export default function ChatPage({ mode, onModeChange }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState('');
  const [clarifyingQuestions, setClarifyingQuestions] = useState([]); // array of { id, question, ... }
  const [clarifyingAnswers, setClarifyingAnswers] = useState({}); // map id -> answer string
  const [sessionId, setSessionId] = useState(() => sessionStorage.getItem(`session_${mode}`) || null);
  const containerRef = useRef(null);
  const MAX_HISTORY = 12; // max messages to keep in context
  const storageKey = useMemo(() => `chatHistory_${mode}`, [mode]);

  useEffect(() => {
    let initialMessages = [];
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          initialMessages = parsed;
        }
      }
    } catch (err) {
      console.warn('Failed to load cached messages', err);
    }
    setMessages(initialMessages);
  }, [storageKey]);

  // when mode changes, load session id for that mode and clear clarifying UI
  useEffect(() => {
    const sid = sessionStorage.getItem(`session_${mode}`);
    setSessionId(sid || null);
    setClarifyingQuestions([]);
    setClarifyingAnswers({});
  }, [mode]);

  // save history and scroll
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch (err) {
      console.warn('Failed to persist chat history', err);
    }
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, storageKey]);

  const appendMessages = useCallback((newMessages) => {
    if (!newMessages || newMessages.length === 0) return;
    setMessages((prev) => [...prev, ...newMessages].slice(-MAX_HISTORY));
  }, []);

  const handleSend = async (file = null, answers = null) => {
    const isFileMessage = Boolean(file);
    if (!isFileMessage && !input.trim() && !answers) return;

    const userApiKey = sessionStorage.getItem('OPENAI_API_KEY');
    if (!userApiKey) {
      setApiKeyModalOpen(true);
      return;
    }

    const newUserMessages = [];
    if (answers) {
      const summary = Object.entries(answers)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
      if (summary) {
        newUserMessages.push({
          role: 'user',
          content: `Submitted clarifying details:\n${summary}`,
          time: formatTime(),
        });
      }
    } else if (!isFileMessage && input.trim()) {
      newUserMessages.push({ role: 'user', content: input.trim(), time: formatTime() });
    }

    if (newUserMessages.length) {
      appendMessages(newUserMessages);
    }

    const historyForApi = [...messages, ...newUserMessages]
      .slice(-MAX_HISTORY)
      .map(({ role, content }) => ({ role, content }));

    setInput('');
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('api_key', userApiKey);
      formData.append('mode', mode);
      formData.append('messages', JSON.stringify(historyForApi));
      if (sessionId) {
        formData.append('session_id', sessionId);
      }
      if (answers) {
        formData.append('answers', JSON.stringify(answers));
      }
      if (isFileMessage) {
        formData.append('file', file);
      }

      // Let axios set the multipart boundary automatically
      const { data } = await apiClient.post('/chat', formData);

      const botReply = typeof data.reply === 'string' && data.reply.trim().length > 0
        ? data.reply
        : 'I did not receive a response. Please try again in a moment.';
      appendMessages([{ role: 'assistant', content: botReply, time: formatTime() }]);

      if (Array.isArray(data.warnings) && data.warnings.length > 0) {
        appendMessages([{ role: 'assistant', content: formatWarnings(data.warnings), time: formatTime() }]);
      }

      const pendingQuestions = Array.isArray(data.clarifying_questions)
        ? data.clarifying_questions
        : Array.isArray(data.pending_questions)
          ? data.pending_questions
          : [];

      if (pendingQuestions.length > 0) {
        setClarifyingQuestions(pendingQuestions);
        setClarifyingAnswers({}); // Reset answers
      } else {
        setClarifyingQuestions([]);
        setClarifyingAnswers({});
      }

      // Handle session ID
      if (data.session_id) {
        setSessionId(data.session_id);
        sessionStorage.setItem(`session_${mode}`, data.session_id);
      }

    } catch (error) {
      const detail = error?.response?.data?.detail;
      const status = error?.response?.status;
      let errorMessage = 'Error: failed to get response from the server.';
      if (status === 422) {
        errorMessage = `Validation error: ${JSON.stringify(detail)}`;
      } else if (typeof detail === 'string') {
        errorMessage = detail;
      } else if (detail?.error?.message) {
        errorMessage = detail.error.message;
      }
      appendMessages([{ role: 'assistant', content: errorMessage, time: formatTime() }]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileClick = () => {
    document.getElementById('file-input').click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isRealFile(file)) {
      appendMessages([{ role: 'assistant', content: 'The selected file could not be read. Please try another PDF.', time: formatTime() }]);
      e.target.value = '';
      return;
    }

    if (file.type !== 'application/pdf') {
      const errorMsg = { role: 'assistant', content: 'Sorry, only PDF files are supported for upload.', time: formatTime() };
      appendMessages([errorMsg]);
      e.target.value = '';
      return;
    }

    const fileUploadMsg = { 
      role: 'user', 
      content: `📄 Uploading "${file.name}" for analysis...`, 
      time: formatTime() 
    };
    appendMessages([fileUploadMsg]);

    await handleSend(file);

    // Allow re-uploading the same file
    e.target.value = '';
  };

  const handleUpdateApiKey = () => {
    if (newApiKey.trim()) {
      sessionStorage.setItem('OPENAI_API_KEY', newApiKey.trim());
      setApiKeyModalOpen(false);
      setNewApiKey('');
      window.location.reload();
    }
  };

  const submitClarifyingAnswers = async () => {
    // Validate that required questions are answered
    const answersToSend = {};
    let hasErrors = false;

    clarifyingQuestions.forEach(q => {
      const answer = clarifyingAnswers[q.id] || '';
      if (q.required && !answer.trim()) {
        hasErrors = true;
        return;
      }
      if (answer.trim()) {
        answersToSend[q.id] = answer.trim();
      }
    });

    if (hasErrors) {
      appendMessages([{ 
        role: 'assistant', 
        content: 'Please answer all required questions before proceeding.', 
        time: formatTime(),
      }]);
      return;
    }

    if (Object.keys(answersToSend).length === 0) return;
    await handleSend(null, answersToSend);
  };

  const handleResetSession = () => {
    sessionStorage.removeItem(`session_${mode}`);
    setSessionId(null);
    setClarifyingQuestions([]);
    setClarifyingAnswers({});
    setMessages([]);
    try {
      localStorage.removeItem(storageKey);
    } catch (err) {
      console.warn('Failed to clear stored messages for mode', mode, err);
    }
  };

  // react-markdown v9: use components to set link target/rel and table styling
  const markdownComponents = {
    a: ({ node, ...props }) => (
      <a {...props} target="_blank" rel="noopener noreferrer" />
    ),
    table: ({ node, ...props }) => (
      <table className="table-auto w-full text-sm border-collapse my-2" {...props} />
    ),
    thead: ({ node, ...props }) => <thead {...props} />,
    tbody: ({ node, ...props }) => <tbody {...props} />,
    tr: ({ node, ...props }) => <tr {...props} />,
    th: ({ node, ...props }) => (
      <th className="border px-3 py-2 text-left bg-gray-100 font-medium" {...props} />
    ),
    td: ({ node, ...props }) => (
      <td className="border px-3 py-2 align-top" {...props} />
    ),
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
          <div className="flex items-center gap-3">
            <button 
              onClick={handleResetSession}
              className="px-3 py-2 border border-[#2d7ff9] text-[#2d7ff9] rounded-lg hover:bg-[#e6f2ff] transition-all duration-200 text-sm font-medium"
            >
              <i className="ri-refresh-line mr-2" />
              Reset Session
            </button>
            <button 
              onClick={() => setApiKeyModalOpen(true)}
              className="flex items-center px-3 py-2 bg-[#2d7ff9] text-white rounded-lg hover:bg-[#1e5bb8] transition-all duration-200 text-sm font-medium"
            >
              <i className="ri-key-line text-lg mr-2" />
              Change API Key
            </button>
          </div>
        </div>
        
        <div ref={containerRef} className="flex-1 p-5 overflow-y-auto flex flex-col space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`${m.role==='assistant'? 'self-start bg-[#f0f2f5] text-[#333]':'self-end bg-[#2d7ff9] text-white'} max-w-[70%] p-4 rounded-lg leading-relaxed mb-2`}> 
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {m.content}
              </ReactMarkdown>
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

          {/* Clarifying Questions UI */}
          {clarifyingQuestions.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-[90%] self-start">
              <h3 className="font-semibold text-blue-900 mb-3 flex items-center">
                <i className="ri-question-line mr-2" />
                Please provide more details:
              </h3>
              <div className="space-y-4">
                {clarifyingQuestions.map((q, idx) => (
                  <div key={q.id} className="space-y-2">
                    <label className="block text-sm font-medium text-blue-800">
                      {idx + 1}. {q.question}
                      {q.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {q.hint && (
                      <p className="text-xs text-blue-600 italic">{q.hint}</p>
                    )}
                    <textarea
                      value={clarifyingAnswers[q.id] || ''}
                      onChange={(e) => setClarifyingAnswers(prev => ({...prev, [q.id]: e.target.value}))}
                      className="w-full p-2 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={2}
                      placeholder={q.hint || "Enter your answer..."}
                    />
                  </div>
                ))}
                <button
                  onClick={submitClarifyingAnswers}
                  disabled={loading}
                  className="bg-[#2d7ff9] text-white px-4 py-2 rounded-lg hover:bg-[#1e5bb8] transition-colors disabled:opacity-50 flex items-center"
                >
                  <i className="ri-send-plane-fill mr-2" />
                  Submit Answers
                </button>
              </div>
            </div>
          )}
        </div>
        
        <div className="border-t p-4 flex items-center">
          <input id="file-input" type="file" className="hidden" onChange={handleFileChange} />
          <div className="flex-1 bg-[#f0f2f5] rounded-full px-4 py-2 flex items-center">
            <i onClick={handleFileClick} className="ri-attachment-2 text-xl text-[#2d7ff9] mr-3 cursor-pointer" />
            <input 
              value={input} 
              onChange={e => setInput(e.target.value)} 
              onKeyPress={e => e.key === 'Enter' && handleSend()}
              className="flex-1 bg-transparent outline-none text-sm" 
              placeholder="Type a message..." 
              disabled={clarifyingQuestions.length > 0}
            />
            <i className="ri-emotion-line text-xl text-[#2d7ff9] ml-3 cursor-pointer" />
          </div>
          <button 
            onClick={() => handleSend()} 
            disabled={clarifyingQuestions.length > 0}
            className="ml-4 bg-[#2d7ff9] w-10 h-10 rounded-full flex items-center justify-center text-white disabled:opacity-50"
          >
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