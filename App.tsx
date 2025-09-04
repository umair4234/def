import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { ChapterOutline, AppStep, GenerationStatus, AppView, ScriptJob, AutomationJobStatus } from './types';
import { generateOutlines, generateHook, generateChapterBatch } from './services/geminiService';
import Button from './components/Button';
import InlineLoader from './components/InlineLoader';
import GenerationControls from './components/GenerationControls';
import PasswordProtection from './components/PasswordProtection';
import ApiKeyManager from './components/ApiKeyManager';
import GearIcon from './components/GearIcon';

// Custom hook for local storage persistence
function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue: React.Dispatch<React.SetStateAction<T>> = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue];
}


const App: React.FC = () => {
  // --- Auth State ---
  const [isAuthenticated, setIsAuthenticated] = useState(sessionStorage.getItem('isAuthenticated') === 'true');

  // --- Global State ---
  const [view, setView] = useState<AppView>('MANUAL');
  const [error, setError] = useState<string | null>(null);
  
  // --- API Key Management ---
  const [apiKeys, setApiKeys] = useLocalStorage<string[]>('gemini_api_keys', []);
  const [isApiManagerOpen, setIsApiManagerOpen] = useState(false);

  // --- Automation & Library State ---
  const [jobs, setJobs] = useLocalStorage<ScriptJob[]>('automation_jobs', []);
  const [automationStatus, setAutomationStatus] = useState<'IDLE' | 'RUNNING'>('IDLE');
  const [automationTitle, setAutomationTitle] = useState('');
  const [automationConcept, setAutomationConcept] = useState('');
  const [automationDuration, setAutomationDuration] = useState(40);
  const [selectedJobToView, setSelectedJobToView] = useState<ScriptJob | null>(null);

  // --- Manual Generation State ---
  const [manualStep, setManualStep] = useState<AppStep>(AppStep.INITIAL);
  const [manualTitle, setManualTitle] = useState('');
  const [manualConcept, setManualConcept] = useState('');
  const [manualDuration, setManualDuration] = useState(40);
  const [manualScriptData, setManualScriptData] = useState<Partial<ScriptJob>>({});

  // --- One-click Flow State ---
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [currentTask, setCurrentTask] = useState('');
  const [writingChapterIds, setWritingChapterIds] = useState<number[]>([]);
  const [progress, setProgress] = useState({ wordsWritten: 0, totalWords: 0 });
  const isStoppedRef = useRef(false);
  const isPausedRef = useRef(false);
  
  const jobToDisplay = selectedJobToView || manualScriptData;

  const totalWords = useMemo(() => {
    const outlines = jobToDisplay?.outlines || [];
    const chapterWords = outlines
        .filter(o => o.id > 0)
        .reduce((sum, ch) => sum + ch.wordCount, 0);
    return chapterWords > 0 ? chapterWords + 150 : 0;
  }, [jobToDisplay]);

  useEffect(() => {
    const countWords = (str: string) => str?.split(/\s+/).filter(Boolean).length || 0;
    
    const hookWords = countWords(jobToDisplay?.hook || '');
    const chapterWords = (jobToDisplay?.chaptersContent || []).reduce((sum, content) => sum + countWords(content), 0);
    
    setProgress({
        wordsWritten: hookWords + chapterWords,
        totalWords: totalWords,
    });
  }, [jobToDisplay, totalWords]);

  const handleAuthentication = (status: boolean) => {
    if (status) {
      sessionStorage.setItem('isAuthenticated', 'true');
      setIsAuthenticated(true);
    }
  };

  const parseOutlineResponse = useCallback((text: string): { refinedTitle: string; outlines: ChapterOutline[] } => {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    const titleLine = lines.find(line => line.toLowerCase().startsWith('title:'));
    const parsedRefinedTitle = titleLine ? titleLine.replace(/title:/i, '').trim() : 'Untitled Story';

    const parsedOutlines: ChapterOutline[] = [];
    const chapterBlocks = text.split(/(?=^Chapter \d+:)/m);

    for (const block of chapterBlocks) {
        if (!block.trim().startsWith('Chapter')) continue;
        const idMatch = block.match(/^Chapter (\d+):/m);
        const titleMatch = block.match(/^Chapter \d+: (.*?)$/m);
        const wordCountMatch = block.match(/^\(Word Count: (\d+) words\)$/m);
        const conceptMatch = block.match(/Concept: ([\s\S]*)/m);

        if (idMatch && titleMatch) {
            const id = parseInt(idMatch[1], 10);
            const chapterTitle = titleMatch[1].trim();
            if (id === 0) {
                parsedOutlines.push({ id: 0, title: "The Hook", wordCount: 0, concept: block.replace(/^Chapter \d+: .*?\n/m, '').trim() });
            } else if (wordCountMatch && conceptMatch) {
                parsedOutlines.push({ id, title: chapterTitle, wordCount: parseInt(wordCountMatch[1], 10), concept: conceptMatch[1].trim().split('\n')[0] });
            }
        }
    }
    return { refinedTitle: parsedRefinedTitle, outlines: parsedOutlines };
  }, []);

  const resetManualState = () => {
    setManualStep(AppStep.INITIAL);
    setManualScriptData({});
    setGenerationStatus(GenerationStatus.IDLE);
    setCurrentTask('');
    setProgress({ wordsWritten: 0, totalWords: 0 });
    isStoppedRef.current = false;
    isPausedRef.current = false;
  }
  
  const handleGenerateFullScript = async () => {
     if (!manualTitle || !manualConcept) {
      setError("Please provide a title and concept.");
      return;
    }
    if (apiKeys.length === 0) {
      setError("No Gemini API keys found. Please add a key in the API Manager.");
      setIsApiManagerOpen(true);
      return;
    }
    setError(null);
    resetManualState();
    setSelectedJobToView(null);
    setGenerationStatus(GenerationStatus.RUNNING);

    try {
        setCurrentTask('Generating story outline...');
        const outlineText = await generateOutlines(manualTitle, manualConcept, manualDuration);
        if (isStoppedRef.current) return;
        
        const { refinedTitle, outlines } = parseOutlineResponse(outlineText);
        if (outlines.length === 0) throw new Error("Failed to generate a valid outline.");
        
        const initialScriptData: Partial<ScriptJob> = { rawOutlineText: outlineText, refinedTitle, outlines, chaptersContent: new Array(outlines.length + 1).fill('')};
        setManualScriptData(initialScriptData);
        setManualStep(AppStep.OUTLINES_GENERATED);

        setCurrentTask('Crafting the perfect hook...');
        const generatedHook = await generateHook(outlineText);
        if (isStoppedRef.current) return;

        setManualScriptData(prev => ({...prev, hook: generatedHook}));
        setManualStep(AppStep.HOOK_GENERATED);

        const chaptersToWrite = outlines.filter(o => o.id > 0);
        const batchSize = 3;
        for (let i = 0; i < chaptersToWrite.length; i += batchSize) {
            const batch = chaptersToWrite.slice(i, i + batchSize);
            while (isPausedRef.current) await new Promise(resolve => setTimeout(resolve, 500));
            if (isStoppedRef.current) return;

            const chapterIds = batch.map(c => c.id);
            setCurrentTask(`Writing Chapter${chapterIds.length > 1 ? 's' : ''} ${chapterIds.join(', ')}...`);
            setWritingChapterIds(chapterIds);
            
            const contentArray = await generateChapterBatch(outlineText, batch);
            
            if (isStoppedRef.current) { setWritingChapterIds([]); return; };

            setManualScriptData(prev => {
                const newContent = [...(prev.chaptersContent || [])];
                batch.forEach((chapter, index) => {
                    if (contentArray[index]) newContent[chapter.id] = contentArray[index];
                });
                return {...prev, chaptersContent: newContent};
            });
            setWritingChapterIds([]);
        }
        setGenerationStatus(GenerationStatus.DONE);
        setCurrentTask('Script generation complete!');
    } catch (e) {
      setError(e instanceof Error ? e.message : "An unknown error occurred during script generation.");
      setGenerationStatus(GenerationStatus.IDLE);
    }
  }

  // --- Automation Flow ---
  const handleAddToQueue = () => {
    if (!automationTitle || !automationConcept) {
      setError("Please provide a title and concept for the automation job.");
      return;
    }
    setError(null);
    const newJob: ScriptJob = {
      id: `job_${Date.now()}`,
      title: automationTitle,
      concept: automationConcept,
      duration: automationDuration,
      status: 'PENDING',
      createdAt: Date.now(),
      rawOutlineText: '',
      refinedTitle: '',
      outlines: [],
      hook: '',
      chaptersContent: [],
    };
    setJobs(prev => [...prev, newJob]);
    setAutomationTitle('');
    setAutomationConcept('');
    setAutomationDuration(40);
  };

  const handleRunAutomation = () => {
    if (apiKeys.length === 0) {
      setError("Cannot run automation. No Gemini API keys found.");
      setIsApiManagerOpen(true);
      return;
    }
    const hasPending = jobs.some(j => j.status === 'PENDING');
    if (!hasPending) {
        alert("No pending jobs in the queue to run.");
        return;
    }
    setAutomationStatus('RUNNING');
    setError(null);
  }

  useEffect(() => {
    if (automationStatus !== 'RUNNING') return;

    let isCancelled = false;
    const processQueue = async () => {
      const nextJob = jobs.find(j => j.status === 'PENDING');
      if (!nextJob) {
        setAutomationStatus('IDLE');
        return;
      }

      setJobs(prev => prev.map(j => j.id === nextJob.id ? { ...j, status: 'RUNNING' } : j));
      
      try {
        const outlineText = await generateOutlines(nextJob.title, nextJob.concept, nextJob.duration);
        if (isCancelled) return;
        const { refinedTitle, outlines } = parseOutlineResponse(outlineText);
        if (outlines.length === 0) throw new Error("Failed to generate a valid outline.");

        const generatedHook = await generateHook(outlineText);
        if (isCancelled) return;
        
        let generatedChapters = new Array(outlines.length + 1).fill('');
        const chaptersToWrite = outlines.filter(o => o.id > 0);
        const batchSize = 3;
        for (let i = 0; i < chaptersToWrite.length; i += batchSize) {
          if (isCancelled) return;
          const batch = chaptersToWrite.slice(i, i + batchSize);
          const contentArray = await generateChapterBatch(outlineText, batch);
          batch.forEach((chapter, index) => {
            if (contentArray[index]) generatedChapters[chapter.id] = contentArray[index];
          });
        }
        
        setJobs(prev => prev.map(j => j.id === nextJob.id ? { 
            ...j, 
            status: 'DONE',
            rawOutlineText: outlineText,
            refinedTitle,
            outlines,
            hook: generatedHook,
            chaptersContent: generatedChapters
        } : j));

        if (jobs.some(j => j.id !== nextJob.id && j.status === 'PENDING')) {
            await new Promise(resolve => setTimeout(resolve, 120000));
        }

      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
        setJobs(prev => prev.map(j => j.id === nextJob.id ? { ...j, status: 'FAILED', error: errorMessage } : j));
      }
    };

    const interval = setInterval(() => {
        if (jobs.find(j => j.status === 'PENDING')) {
            processQueue();
        } else {
            setAutomationStatus('IDLE');
            clearInterval(interval);
        }
    }, 1000);

    return () => { isCancelled = true; clearInterval(interval) };
  }, [automationStatus, jobs, setJobs, parseOutlineResponse]);


  const getStatusBadge = (status: AutomationJobStatus) => {
    const styles: Record<AutomationJobStatus, string> = {
        PENDING: 'bg-yellow-800 text-yellow-200',
        RUNNING: 'bg-blue-800 text-blue-200 animate-pulse',
        DONE: 'bg-green-800 text-green-200',
        FAILED: 'bg-red-800 text-red-200',
    }
    return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${styles[status]}`}>{status}</span>
  }

  const copyToClipboard = (text: string, type: string) => {
    if (!text) {
      alert(`Nothing to copy for ${type}.`);
      return;
    }
    navigator.clipboard.writeText(text)
      .then(() => alert(`${type} copied to clipboard!`))
      .catch(err => alert(`Failed to copy ${type}.`));
  }
  
  const stripChapterHeading = (text: string): string => {
    if (!text) return '';
    return text.replace(/^Chapter\s+\d+:\s+.*?\n\n?/im, '').trim();
  };

  const handleCopyFullScript = () => {
    const scriptParts = [
      jobToDisplay?.hook,
      ...(jobToDisplay?.chaptersContent || []).slice(1).filter(Boolean).map(stripChapterHeading)
    ];
    copyToClipboard(scriptParts.join('\n\n'), "Full script");
  }

  const handleCopyHookAndChapter1 = () => {
    const scriptParts = [jobToDisplay?.hook, stripChapterHeading(jobToDisplay?.chaptersContent?.[1] || '')].filter(Boolean);
    copyToClipboard(scriptParts.join('\n\n'), "Hook and Chapter 1");
  }

  const handleCopyRestOfScript = () => {
    const scriptParts = (jobToDisplay?.chaptersContent || []).slice(2).filter(Boolean).map(stripChapterHeading);
    copyToClipboard(scriptParts.join('\n\n'), "Rest of script");
  }

  const isGenerating = generationStatus === GenerationStatus.RUNNING || generationStatus === GenerationStatus.PAUSED;
  const isScriptGenerated = (manualStep >= AppStep.HOOK_GENERATED && !isGenerating) || (selectedJobToView?.status === 'DONE');
  
  if (!isAuthenticated) {
    return <PasswordProtection onAuthenticate={handleAuthentication} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 font-sans">
      <ApiKeyManager
        isOpen={isApiManagerOpen}
        onClose={() => setIsApiManagerOpen(false)}
        apiKeys={apiKeys}
        setApiKeys={setApiKeys}
      />
      <GenerationControls status={generationStatus} onPause={() => { isPausedRef.current = true; setGenerationStatus(GenerationStatus.PAUSED); }} onResume={() => { isPausedRef.current = false; setGenerationStatus(GenerationStatus.RUNNING); }} onStop={() => { isStoppedRef.current = true; isPausedRef.current = false; setGenerationStatus(GenerationStatus.DONE); }} currentTask={currentTask} progress={progress} />
      
      <main className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        <header className="text-center mb-10 relative">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500">
            AI YouTube Scriptwriter
          </h1>
          <p className="mt-2 text-lg text-gray-400">Automate your viral revenge story script in minutes.</p>
           <button 
             onClick={() => setIsApiManagerOpen(true)}
             className="absolute top-0 right-0 p-2 text-gray-400 hover:text-white transition-colors duration-200"
             aria-label="Open API Key Manager"
           >
             <GearIcon />
           </button>
        </header>

        <nav className="flex justify-center items-center gap-2 mb-8 p-2 bg-gray-800 rounded-lg">
            {(['MANUAL', 'AUTOMATION', 'LIBRARY'] as AppView[]).map(v => (
                <button 
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors duration-200 w-full ${view === v ? 'bg-indigo-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                >
                    {v.charAt(0) + v.slice(1).toLowerCase()}
                </button>
            ))}
        </nav>

        {error && (
            <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg relative mb-6" role="alert">
                <strong className="font-bold">Error: </strong>
                <span className="block sm:inline">{error}</span>
                <button onClick={() => setError(null)} className="absolute top-0 bottom-0 right-0 px-4 py-3">
                    <span className="text-2xl">&times;</span>
                </button>
            </div>
        )}
        
        <div className="bg-gray-800/50 p-6 rounded-lg shadow-lg mb-8">
          {view === 'MANUAL' && (
            <div>
              <h2 className="text-2xl font-bold mb-4 text-indigo-400">Manual Script Generator</h2>
              <div className="space-y-4">
                  <input type="text" value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="Video Title" className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                  <textarea value={manualConcept} onChange={e => setManualConcept(e.target.value)} placeholder="Story Concept / Summary" rows={4} className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none"></textarea>
                  <div className="flex items-center gap-4">
                    <label htmlFor="duration" className="font-medium">Video Duration (mins):</label>
                    <input type="number" id="duration" value={manualDuration} onChange={e => setManualDuration(Number(e.target.value))} className="w-24 bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                  </div>
                  <Button onClick={handleGenerateFullScript} disabled={isGenerating}>
                    {isGenerating ? 'Generating...' : 'Generate Full Script'}
                  </Button>
              </div>
            </div>
          )}

          {view === 'AUTOMATION' && (
            <div>
              <h2 className="text-2xl font-bold mb-4 text-indigo-400">Setup Automation</h2>
              <div className="space-y-4 p-4 border border-gray-700 rounded-lg mb-6">
                  <input type="text" value={automationTitle} onChange={e => setAutomationTitle(e.target.value)} placeholder="Video Title" className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                  <textarea value={automationConcept} onChange={e => setAutomationConcept(e.target.value)} placeholder="Story Concept / Summary" rows={4} className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none"></textarea>
                  <div className="flex items-center gap-4">
                    <label htmlFor="auto_duration" className="font-medium">Video Duration (mins):</label>
                    <input type="number" id="auto_duration" value={automationDuration} onChange={e => setAutomationDuration(Number(e.target.value))} className="w-24 bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                  </div>
                  <Button onClick={handleAddToQueue}>Add to Queue</Button>
              </div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Automation Queue ({jobs.filter(j => j.status === 'PENDING').length} pending)</h3>
                <Button onClick={handleRunAutomation} disabled={automationStatus === 'RUNNING' || !jobs.some(j=>j.status === 'PENDING')} variant="primary">
                  {automationStatus === 'RUNNING' ? 'Automation Running...' : 'Run Automation'}
                </Button>
              </div>
              <ul className="space-y-3">
                {jobs.map(job => (
                  <li key={job.id} className="bg-gray-700 p-3 rounded-md flex justify-between items-center">
                    <div>
                      <p className="font-semibold">{job.title}</p>
                      <p className="text-sm text-gray-400">{job.concept.substring(0, 50)}...</p>
                    </div>
                    {getStatusBadge(job.status)}
                  </li>
                ))}
                {jobs.length === 0 && <p className="text-gray-400 text-center py-4">Queue is empty. Add a script to get started.</p>}
              </ul>
            </div>
          )}

          {view === 'LIBRARY' && (
             <div>
              <h2 className="text-2xl font-bold mb-4 text-indigo-400">Script Library</h2>
               <ul className="space-y-3">
                {[...jobs].sort((a,b) => b.createdAt - a.createdAt).map(job => (
                  <li key={job.id} onClick={() => setSelectedJobToView(job)} className={`bg-gray-700 p-4 rounded-md flex justify-between items-center cursor-pointer hover:bg-gray-600 transition-colors duration-200 ${selectedJobToView?.id === job.id ? 'ring-2 ring-indigo-500' : ''}`}>
                    <div>
                      <p className="font-semibold">{job.refinedTitle || job.title}</p>
                      <p className="text-sm text-gray-400">Created: {new Date(job.createdAt).toLocaleString()}</p>
                    </div>
                    {getStatusBadge(job.status)}
                  </li>
                ))}
                {jobs.length === 0 && <p className="text-gray-400 text-center py-4">No scripts found. Generate a script or add one to the automation queue.</p>}
              </ul>
            </div>
          )}
        </div>

        {jobToDisplay && jobToDisplay.outlines && jobToDisplay.outlines.length > 0 && (
          <div className="mt-10 animate-fade-in">
            <h2 className="text-3xl font-bold mb-4 text-center text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-purple-400">{jobToDisplay.refinedTitle}</h2>
            
            <div className="sticky top-0 bg-gray-950/80 backdrop-blur-sm z-10 py-4 mb-4">
                <div className="flex flex-wrap justify-center gap-3">
                    <Button onClick={handleCopyFullScript} disabled={!isScriptGenerated}>Copy Full Script</Button>
                    <Button onClick={handleCopyHookAndChapter1} disabled={!isScriptGenerated} variant="secondary">Copy Hook & Ch. 1</Button>
                    <Button onClick={handleCopyRestOfScript} disabled={!isScriptGenerated} variant="secondary">Copy Ch. 2 Onwards</Button>
                </div>
            </div>

            <div className="bg-gray-800/50 p-6 rounded-lg shadow-inner space-y-8">
              <div>
                <h3 className="text-xl font-semibold mb-3 border-b-2 border-indigo-500 pb-2">The Hook</h3>
                {jobToDisplay.hook ? <p className="whitespace-pre-wrap font-serif text-lg leading-relaxed">{jobToDisplay.hook}</p> : <InlineLoader message="Generating hook..." />}
              </div>

              {jobToDisplay.outlines.filter(o => o.id > 0).map(outline => (
                <div key={outline.id}>
                   <h3 className="text-xl font-semibold mb-3 border-b-2 border-indigo-500 pb-2">Chapter {outline.id}: {outline.title} <span className="text-sm text-gray-400 font-normal">({outline.wordCount} words)</span></h3>
                   {jobToDisplay.chaptersContent?.[outline.id] ? (
                     <p className="whitespace-pre-wrap font-serif text-lg leading-relaxed">{jobToDisplay.chaptersContent[outline.id]}</p>
                   ) : (
                     <InlineLoader message={writingChapterIds.includes(outline.id) ? `Writing chapter ${outline.id}...` : 'Waiting to write...'} />
                   )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;