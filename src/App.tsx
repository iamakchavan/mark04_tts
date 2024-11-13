import React, { useState, useEffect, useCallback, useRef } from 'react';
import { analyzeCurrentPage, askQuestion, defineSelection, elaborateSelection } from './utils/ai';
import { Header } from './components/Header';
import { QuestionInput } from './components/QuestionInput';
import { ContentSection } from './components/ContentSection';
import { FocusModal } from './components/FocusModal';
import { SelectionPopup } from './components/SelectionPopup';
import { AnswerAnimation } from './components/AnswerAnimation';

interface SearchResult {
  id: string;
  content: string;
  timestamp: number;
}

const App: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [answerType, setAnswerType] = useState<'define' | 'elaborate' | 'search' | null>(null);
  const [summary, setSummary] = useState('');
  const [url, setUrl] = useState('');
  const [showFocusModal, setShowFocusModal] = useState(false);
  const [searchScope, setSearchScope] = useState<'all' | 'domain' | 'page'>('page');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSummarized, setIsSummarized] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [selectionPopup, setSelectionPopup] = useState<{
    position: { x: number; y: number } | null;
    text: string;
    visible: boolean;
  }>({
    position: null,
    text: '',
    visible: false
  });

  const answerRef = useRef<HTMLDivElement>(null);
  const searchAnswerRef = useRef<HTMLDivElement>(null);
  const latestSearchRef = useRef<HTMLDivElement>(null);

  // Load saved state from storage
  useEffect(() => {
    chrome.storage.local.get(['summary', 'answer', 'searchResults', 'darkMode'], (result) => {
      if (result.summary) setSummary(result.summary);
      if (result.answer) setAnswer(result.answer);
      if (result.searchResults) setSearchResults(result.searchResults);
      if (result.darkMode !== undefined) {
        setDarkMode(result.darkMode);
        if (result.darkMode) {
          document.documentElement.classList.add('dark');
        }
      }
    });

    summarizeCurrentPage();
    getCurrentUrl();
    document.addEventListener('mouseup', handleTextSelection);
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('mouseup', handleTextSelection);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Save state to storage whenever it changes
  useEffect(() => {
    chrome.storage.local.set({
      summary,
      answer,
      searchResults,
      darkMode
    });
  }, [summary, answer, searchResults, darkMode]);

  // Effect to handle scrolling to latest search result
  useEffect(() => {
    if (searchResults.length > 0) {
      setTimeout(() => {
        latestSearchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [searchResults]);

  const scrollToAnswer = () => {
    setTimeout(() => {
      answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const getCurrentUrl = async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.url) {
      setUrl(tabs[0].url);
    }
  };

  const summarizeCurrentPage = async () => {
    setIsSummarizing(true);
    setLoading(true);
    try {
      const summary = await analyzeCurrentPage();
      setSummary(summary);
      setIsSummarized(true);
    } catch (error) {
      console.error('Error analyzing page:', error);
    }
    setLoading(false);
    setIsSummarizing(false);
  };

  const handleTextSelection = useCallback((event: MouseEvent) => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    if (selectedText && selectedText.length > 0) {
      const range = selection?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();

      if (rect) {
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const popupWidth = 300;
        const popupHeight = 150;

        let x = rect.left + (rect.width / 2);
        let y = rect.top;

        if (x - popupWidth/2 < 0) {
          x = popupWidth/2;
        } else if (x + popupWidth/2 > windowWidth) {
          x = windowWidth - popupWidth/2;
        }

        if (y - popupHeight < 0) {
          y = rect.bottom + 10;
        } else {
          y = rect.top - 10;
        }

        setSelectionPopup({
          position: { x, y },
          text: selectedText,
          visible: true
        });
      }
    } else {
      setSelectionPopup(prev => ({ ...prev, visible: false }));
    }
  }, []);

  const handleClickOutside = useCallback((event: MouseEvent) => {
    const popup = document.querySelector('.selection-popup');
    if (!popup?.contains(event.target as Node)) {
      setSelectionPopup(prev => ({ ...prev, visible: false }));
    }
  }, []);

  const handleQuestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    try {
      const response = await askQuestion(question, searchScope);
      setAnswer(response);
      setQuestion('');
      scrollToAnswer();
    } catch (error) {
      console.error('Error getting answer:', error);
    }
    setLoading(false);
  };

  const handleSearch = (answer: string) => {
    const newSearchResult: SearchResult = {
      id: Date.now().toString(),
      content: answer,
      timestamp: Date.now()
    };
    setSearchResults(prev => [...prev, newSearchResult]);
    setAnswerType('search');
  };

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    if (newDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <div className={`app-container ${darkMode ? 'dark' : ''}`}>
      <Header 
        url={url} 
        onSummarize={summarizeCurrentPage}
        isSummarizing={isSummarizing}
        isSummarized={isSummarized}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
      />
      
      <div className="p-4 space-y-4">
        <QuestionInput
          question={question}
          loading={loading}
          onChange={setQuestion}
          onSubmit={handleQuestionSubmit}
          onFocusClick={() => setShowFocusModal(true)}
          searchScope={searchScope}
        />
        
        {summary && <ContentSection title="Page Summary" content={summary} />}
        
        <div ref={answerRef}>
          {loading && answerType && !answer && (
            <AnswerAnimation type={answerType} />
          )}
          {answer && (
            <ContentSection 
              title="Answer" 
              content={answer} 
            />
          )}
        </div>

        <div ref={searchAnswerRef} id="search-answer">
          {searchResults.map((result, index) => (
            <div 
              key={result.id} 
              ref={index === searchResults.length - 1 ? latestSearchRef : null}
            >
              <ContentSection 
                title={`Search Result (${new Date(result.timestamp).toLocaleTimeString()})`}
                content={result.content} 
              />
            </div>
          ))}
        </div>
      </div>

      <SelectionPopup
        position={selectionPopup.position}
        selectedText={selectionPopup.text}
        onDefine={() => {}}
        onExplain={() => {}}
        onSearch={handleSearch}
        visible={selectionPopup.visible}
        darkMode={darkMode}
      />

      <FocusModal
        isOpen={showFocusModal}
        onClose={() => setShowFocusModal(false)}
        onScopeSelect={setSearchScope}
        currentScope={searchScope}
      />
    </div>
  );
};

export default App;