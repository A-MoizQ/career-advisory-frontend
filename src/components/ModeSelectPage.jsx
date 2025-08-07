import React, { useState } from 'react';

const modes = [
  { key: 'career_advice', title: 'Career Advice', desc: 'Get personalized guidance on career paths and professional development', icon: 'ri-compass-3-line' },
  { key: 'resume_review', title: 'Resume Tuning', desc: 'Optimize your resume to stand out to recruiters and hiring managers', icon: 'ri-file-edit-line' },
  { key: 'job_hunt', title: 'Job Hunt', desc: 'Find job opportunities that match your skills and career goals', icon: 'ri-search-line' },
  { key: 'learning_roadmap', title: 'Learning Roadmap', desc: 'Create a customized plan to acquire skills for your target role', icon: 'ri-road-map-line' },
  { key: 'mock_interview', title: 'Mock Interview', desc: 'Practice interview questions and receive feedback to improve', icon: 'ri-chat-4-line' }
];

export default function ModeSelectPage({ onContinue }) {
  const [selected, setSelected] = useState(modes[0].key);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f7fa] font-[AlibabaSans]">
      <div className="bg-white w-[480px] rounded-2xl shadow-lg p-10 mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#1a1a1a] mb-2">Choose Your Mode</h1>
          <p className="text-sm text-[#666] leading-relaxed">Select the assistance mode that best fits your current career needs</p>
        </div>
        <div className="space-y-4 mb-8">
          {modes.map(mode => (
            <div key={mode.key}
              className={`flex items-center p-4 rounded-lg border ${selected===mode.key? 'bg-[#e6f2ff] border-[#4a90e2]':'border-[#e6e6e6]'} cursor-pointer`}
              onClick={() => setSelected(mode.key)}>
              <div className={`w-5 h-5 rounded-full border-2 mr-4 flex items-center justify-center flex-shrink-0 ${selected===mode.key? 'border-[#4a90e2]':'border-[#ccc]'}`}>
                <div className={`${selected===mode.key? 'bg-[#4a90e2]':'bg-transparent'} w-3 h-3 rounded-full flex-shrink-0`} />
              </div>
              <i className={`${mode.icon} text-xl text-[#4a90e2] mr-4`} />
              <div className="flex-grow">
                <div className="text-base font-medium text-[#1a1a1a]">{mode.title}</div>
                <div className="text-sm text-[#666] leading-snug">{mode.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => onContinue(selected)}
          className="w-full py-3 bg-[#4a90e2] text-white rounded-lg font-medium hover:bg-[#3a7bc8] transition">
          Continue
        </button>
      </div>
    </div>
  );
}