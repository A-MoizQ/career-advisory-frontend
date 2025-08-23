import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const modeOptions = [
  'career_advice',
  'resume_review',
  'job_hunt',
  'learning_roadmap',
  'mock_interview'
];

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
  const MAX_HISTORY = 10; // max messages to keep in context

  // load history
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    setMessages(stored);
  }, []);

  // when mode changes, load session id for that mode and clear clarifying UI
  useEffect(() => {
    const sid = sessionStorage.getItem(`session_${mode}`);
    setSessionId(sid || null);
    setClarifyingQuestions([]);
    setClarifyingAnswers({});
  }, [mode]);

  // save history and scroll
  useEffect(() => {
    localStorage.setItem('chatHistory', JSON.stringify(messages));
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  const pushMessage = (msg) => {
    setMessages(prev => [...prev, msg].slice(-MAX_HISTORY));
  };

  const handleSend = async (file = null, answers = null) => {
    const isFileMessage = Boolean(file);
    if (!isFileMessage && !input.trim() && !answers) return;

    const userApiKey = sessionStorage.getItem('OPENAI_API_KEY');
    if (!userApiKey) {
      setApiKeyModalOpen(true);
      return;
    }

    // Add user message to chat (unless it's clarifying answers)
    if (answers) {
      // Show a compact message summarizing answers
      const summary = Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join('\n');
      pushMessage({ role: 'user', content: `Answered clarifying questions:\n${summary}`, time: new Date().toLocaleTimeString() });
    } else if (!isFileMessage) {
      const userMsg = { role: 'user', content: input, time: new Date().toLocaleTimeString() };
      pushMessage(userMsg);
    }

    // Prepare messages for the API call. Use last MAX_HISTORY messages
    const messagesForApi = messages.slice(-MAX_HISTORY).map(m => ({
      role: m.role,
      content: m.content
    }));

    // If it's a text message and the local 'input' wasn't already in the messages slice, add it
    if (!isFileMessage && !answers) {
      // we already pushed the user message above, but messages variable isn't updated instantly.
      // include the input explicitly to be safe
      messagesForApi.push({ role: 'user', content: input });
    }

    setInput('');
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('api_key', userApiKey);
      formData.append('mode', mode);
      formData.append('messages', JSON.stringify(messagesForApi));
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
      const resp = await axios.post('/chat', formData);

      const data = resp.data;
      const botReply = data.reply;
      const botMsg = { role: 'assistant', content: botReply, time: new Date().toLocaleTimeString() };
      pushMessage(botMsg);

      // Handle clarifying questions
      if (data.clarifying_questions && data.clarifying_questions.length > 0) {
        setClarifyingQuestions(data.clarifying_questions);
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
      pushMessage({ role: 'assistant', content: errorMessage, time: new Date().toLocaleTimeString() });
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

    if (file.type !== 'application/pdf') {
      const errorMsg = { role: 'assistant', content: 'Sorry, only PDF files are supported for upload.', time: new Date().toLocaleTimeString() };
      pushMessage(errorMsg);
      e.target.value = '';
      return;
    }

    const fileUploadMsg = { 
      role: 'user', 
      content: `📄 Uploading "${file.name}" for analysis...`, 
      time: new Date().toLocaleTimeString() 
    };
    pushMessage(fileUploadMsg);

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
      pushMessage({ 
        role: 'assistant', 
        content: 'Please answer all required questions before proceeding.', 
        time: new Date().toLocaleTimeString() 
      });
      return;
    }

    if (Object.keys(answersToSend).length === 0) return;
    await handleSend(null, answersToSend);
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