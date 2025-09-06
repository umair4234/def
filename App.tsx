import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { ChapterOutline, AppStep, GenerationStatus, AppView, ScriptJob, AutomationJobStatus, LibraryStatus, ThumbnailIdeas } from './types';
import { generateOutlines, generateHook, generateChapterBatch, generateThumbnailIdeas, generateThumbnailImage } from './services/geminiService';
import Button from './components/Button';
import InlineLoader from './components/InlineLoader';
import GenerationControls from './components/GenerationControls';
import PasswordProtection from './components/PasswordProtection';
import ApiKeyManager from './components/ApiKeyManager';
import GearIcon from './components/GearIcon';
import ThumbnailIdeasModal from './components/ThumbnailIdeasModal';
import CopyControls from './components/CopyControls';
import ManualProgressTracker from './components/ManualProgressTracker';

// Custom hook for local storage persistence
function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
      // FIX: Added curly braces to the catch block to fix syntax error.
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
  const [automationStatus, setAutomationStatus] = useState<'IDLE' | 'RUNNING' | 'PAUSED'>('IDLE');
  const automationStatusRef = useRef(automationStatus);
  const jobsRef = useRef(jobs);
  const [automationTitle, setAutomationTitle] = useState('');
  const [automationConcept, setAutomationConcept] = useState('');
  const [automationDuration, setAutomationDuration] = useState(40);
  const [selectedJobToView, setSelectedJobToView] = useState<ScriptJob | null>(null);
  const [showArchived, setShowArchived] = useState(false);


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
  
  // --- Thumbnail Generation State ---
  const [isThumbnailModalOpen, setIsThumbnailModalOpen] = useState(false);
  const [thumbnailIdeas, setThumbnailIdeas] = useState<ThumbnailIdeas | null>(null);
  const [isGeneratingThumbnailIdeas, setIsGeneratingThumbnailIdeas] = useState(false);
  const [isGeneratingThumbnailImage, setIsGeneratingThumbnailImage] = useState(false);


  // --- UI State ---
  const [isOutlineCollapsed, setIsOutlineCollapsed] = useState(false);

  useEffect(() => {
    automationStatusRef.current = automationStatus;
  }, [automationStatus]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);
  
  const jobToDisplay = selectedJobToView || manualScriptData;

  const totalWords = useMemo(() => {
    const countWords = (str: string) => str?.split(/\s+/).filter(Boolean).length || 0;
    const hookWords = countWords(jobToDisplay?.hook || '');
    const chapterWords = (jobToDisplay?.chaptersContent || []).reduce((sum, content) => sum + countWords(content), 0);
    return hookWords + chapterWords;
  }, [jobToDisplay]);

  // Collapse outline once hook is generated, manage state when job changes
  useEffect(() => {
    setIsOutlineCollapsed(!!jobToDisplay?.hook);
  }, [jobToDisplay]);

  // This effect is for the progress bar total
  const totalWordsForProgress = useMemo(() => {
    const outlines = jobToDisplay?.outlines || [];
    const chapterWords = outlines
        .filter(o => o.id > 0)
        .reduce((sum, ch) => sum + ch.wordCount, 0);
    return chapterWords > 0 ? chapterWords + 150 : 0;
  }, [jobToDisplay?.outlines]);


  useEffect(() => {
    const countWords = (str: string) => str?.split(/\s+/).filter(Boolean).length || 0;
    
    const hookWords = countWords(jobToDisplay?.hook || '');
    const chapterWords = (jobToDisplay?.chaptersContent || []).reduce((sum, content) => sum + countWords(content), 0);
    
    setProgress({
        wordsWritten: hookWords + chapterWords,
        totalWords: totalWordsForProgress,
    });
  }, [jobToDisplay, totalWordsForProgress]);

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

  // --- CENTRALIZED SCRIPT GENERATION LOGIC ---
  const runGenerationProcess = async (
    title: string,
    concept: string,
    duration: number,
    onProgress: (update: Partial<ScriptJob>) => void,
    existingData: Partial<ScriptJob> = {}
  ) => {
    isStoppedRef.current = false;
    isPausedRef.current = false;
    setGenerationStatus(GenerationStatus.RUNNING);

    try {
        let outlineText = existingData.rawOutlineText || '';
        let outlines = existingData.outlines || [];
        let refinedTitle = existingData.refinedTitle || '';

        // Step 1: Generate Outlines (if needed)
        if (!outlineText || outlines.length === 0) {
            setCurrentTask('Generating story outline...');
            outlineText = await generateOutlines(title, concept, duration);
            if (isStoppedRef.current) throw new Error("Stopped by user.");
            
            const parsed = parseOutlineResponse(outlineText);
            outlines = parsed.outlines;
            refinedTitle = parsed.refinedTitle;
            if (outlines.length === 0) throw new Error("Failed to generate a valid outline.");

            onProgress({ rawOutlineText: outlineText, outlines, refinedTitle });
        }
        
        // Step 2: Generate Hook (if needed)
        let hook = existingData.hook || '';
        if (!hook) {
            if (isStoppedRef.current) throw new Error("Stopped by user.");
            while (isPausedRef.current) await new Promise(res => setTimeout(res, 1000));
            setCurrentTask('Writing the hook...');
            hook = await generateHook(outlineText);
            if (!hook) throw new Error("Failed to generate a valid hook.");
            onProgress({ hook });
        }
        
        // Step 3: Generate Chapters (if needed)
        let chaptersContent = existingData.chaptersContent || [];
        const storyChapters = outlines.filter(o => o.id > 0);
        
        const chaptersToWrite = storyChapters.filter((chapter, index) => !chaptersContent[index]);

        if (chaptersToWrite.length > 0) {
            const BATCH_SIZE = 3;
            for (let i = 0; i < chaptersToWrite.length; i += BATCH_SIZE) {
                if (isStoppedRef.current) throw new Error("Stopped by user.");
                while (isPausedRef.current) await new Promise(res => setTimeout(res, 1000));
                
                const batch = chaptersToWrite.slice(i, i + BATCH_SIZE);
                setCurrentTask(`Writing chapters ${batch.map(c => c.id).join(', ')}...`);
                setWritingChapterIds(batch.map(c => c.id));
                
                const generatedBatchContent = await generateChapterBatch(outlineText, batch);
                if (generatedBatchContent.length !== batch.length) {
                    throw new Error(`Chapter generation mismatch. Expected ${batch.length}, got ${generatedBatchContent.length}.`);
                }
                
                chaptersContent = [...chaptersContent, ...generatedBatchContent];
                onProgress({ chaptersContent: [...chaptersContent] });
            }
        }

        setWritingChapterIds([]);
        setGenerationStatus(GenerationStatus.DONE);
        setCurrentTask('Done!');
    } catch (error) {
        setGenerationStatus(GenerationStatus.IDLE);
        setWritingChapterIds([]);
        // Re-throw the error to be caught by the calling function (handleManualOneClickGenerate or startAutomation)
        throw error;
    }
  };

  const handleStop = () => {
    isStoppedRef.current = true;
    isPausedRef.current = false;
    setGenerationStatus(GenerationStatus.IDLE);
    setAutomationStatus('IDLE');
    setCurrentTask('');
    setWritingChapterIds([]);
  };

  const handlePause = () => {
    isPausedRef.current = true;
    setGenerationStatus(GenerationStatus.PAUSED);
    setAutomationStatus('PAUSED');
  };

  const handleResume = () => {
    isPausedRef.current = false;
    setGenerationStatus(GenerationStatus.RUNNING);
    setAutomationStatus('RUNNING');
  };

  const handleManualOneClickGenerate = async () => {
    setError(null);
    setManualScriptData({
      title: manualTitle,
      concept: manualConcept,
      duration: manualDuration,
    });
    setManualStep(AppStep.OUTLINES_GENERATED);

    try {
      await runGenerationProcess(
        manualTitle,
        manualConcept,
        manualDuration,
        (update) => {
          setManualScriptData(prev => ({ ...prev, ...update }));
        }
      );
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      setError(errorMsg);
      
      // FIX: Added default values for required ScriptJob properties to ensure type safety.
      const failedJob: ScriptJob = {
          id: `manual_${Date.now()}`,
          source: 'MANUAL',
          title: manualTitle,
          concept: manualConcept,
          duration: manualDuration,
          status: 'FAILED',
          createdAt: Date.now(),
          error: errorMsg,
          // Add defaults for required fields before spreading partial data
          rawOutlineText: '',
          refinedTitle: '',
          outlines: [],
          hook: '',
          chaptersContent: [],
          ...manualScriptData // This contains the partial data
      };
      setJobs(prevJobs => [failedJob, ...prevJobs]);
      alert("Script generation failed. The partial script has been saved to the Automation queue. You can resume it from there.");
      setView('AUTOMATION');
      resetManualState();
    }
  };
  
  // --- Automation Logic ---
  const addJobToQueue = () => {
    if (!automationTitle.trim() || !automationConcept.trim()) {
        alert("Please provide a title and concept.");
        return;
    }
    const newJob: ScriptJob = {
        id: `auto_${Date.now()}`,
        source: 'AUTOMATION',
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
    setJobs(prev => [newJob, ...prev]);
    setAutomationTitle('');
    setAutomationConcept('');
  };

  const updateJob = useCallback((jobId: string, updates: Partial<ScriptJob>) => {
    setJobs(prevJobs => prevJobs.map(job => 
        job.id === jobId ? { ...job, ...updates } : job
    ));
    // Also update the selected job if it's the one being updated
    setSelectedJobToView(prev => prev && prev.id === jobId ? { ...prev, ...updates } : prev);
  }, [setJobs]);
  
  const startAutomation = useCallback(async () => {
    if (automationStatusRef.current === 'RUNNING') return;
    setAutomationStatus('RUNNING');

    while (true) {
        if (isStoppedRef.current) {
            setAutomationStatus('IDLE');
            break;
        }
        while (isPausedRef.current) {
            await new Promise(res => setTimeout(res, 1000));
        }
        
        const pendingJob = jobsRef.current.find(j => j.status === 'PENDING');
        if (!pendingJob) {
            setAutomationStatus('IDLE');
            break;
        }

        updateJob(pendingJob.id, { status: 'RUNNING', currentTask: 'Starting...' });
        
        let currentJobData: Partial<ScriptJob> = { ...pendingJob };

        try {
            await runGenerationProcess(
                pendingJob.title,
                pendingJob.concept,
                pendingJob.duration,
                (update) => {
                    currentJobData = { ...currentJobData, ...update };
                    updateJob(pendingJob.id, { ...update, status: 'RUNNING' });
                },
                pendingJob // Pass the entire job object as existingData for resuming
            );
            updateJob(pendingJob.id, { status: 'DONE', libraryStatus: 'AVAILABLE', error: undefined, currentTask: 'Completed' });
        } catch (e) {
            console.error(`Job ${pendingJob.id} failed:`, e);
            updateJob(pendingJob.id, {
                ...currentJobData,
                status: 'FAILED',
                error: e instanceof Error ? e.message : String(e),
                currentTask: 'Failed'
            });
        }
    }
  }, [updateJob]);

  const handleResumeJob = (jobId: string) => {
    setJobs(prevJobs => prevJobs.map(j => 
        j.id === jobId ? { ...j, status: 'PENDING', error: undefined, currentTask: 'Queued for resume...' } : j
    ));
    if (automationStatusRef.current !== 'RUNNING') {
      // Use setTimeout to allow state to update before starting
      setTimeout(() => startAutomation(), 0);
    }
  };

  const handleArchive = (jobId: string) => {
      updateJob(jobId, { libraryStatus: 'ARCHIVED' });
  };
  
  const handleUnarchive = (jobId: string) => {
      updateJob(jobId, { libraryStatus: 'AVAILABLE' });
  };

  const handleDeleteJob = (jobId: string) => {
      if (window.confirm("Are you sure you want to permanently delete this script? This cannot be undone.")) {
        setJobs(prev => prev.filter(j => j.id !== jobId));
        if (selectedJobToView?.id === jobId) {
            setSelectedJobToView(null);
        }
      }
  };

  const handleGenerateThumbnailIdeas = async (job: ScriptJob | Partial<ScriptJob>, force = false) => {
    if (!job?.hook || !job.title) return;

    if (job.thumbnailIdeas && !force) {
        setThumbnailIdeas(job.thumbnailIdeas);
        setIsThumbnailModalOpen(true);
        return;
    }

    setIsThumbnailModalOpen(true);
    setIsGeneratingThumbnailIdeas(true);
    setThumbnailIdeas(null);
    try {
        const ideas = await generateThumbnailIdeas(job.refinedTitle || job.title, job.hook);
        setThumbnailIdeas(ideas);

        const updatedJobData = { thumbnailIdeas: ideas, thumbnailImageUrls: [] }; // Reset images on re-analyze
        if (job.id) {
            updateJob(job.id, updatedJobData);
        } else {
            setManualScriptData(prev => ({ ...prev, ...updatedJobData }));
        }
    } catch (error) {
        console.error("Failed to generate thumbnail ideas:", error);
        setThumbnailIdeas(null);
    } finally {
        setIsGeneratingThumbnailIdeas(false);
    }
  };
  
  const handleGenerateThumbnailImage = async (config: {
    prompt: string;
    text?: string;
    addText?: boolean;
    baseImage?: string;
    model: 'gemini-2.5-flash-image-preview' | 'imagen-4.0-generate-001';
  }) => {
    setIsGeneratingThumbnailImage(true);
    try {
      const { prompt, text = '', addText = false, baseImage, model } = config;

      const imageUrl = await generateThumbnailImage(prompt, text, addText, model, baseImage);

      const currentUrls = jobToDisplay?.thumbnailImageUrls || [];
      const updatedUrls = [...currentUrls, imageUrl];

      const updatedJobData = { thumbnailImageUrls: updatedUrls };

      if (jobToDisplay?.id) {
        updateJob(jobToDisplay.id, updatedJobData);
      } else {
        setManualScriptData(prev => ({ ...prev, ...updatedJobData }));
      }
    } catch (error) {
      console.error("Failed to generate thumbnail image:", error);
      alert(`Failed to generate thumbnail image. Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsGeneratingThumbnailImage(false);
    }
  };

  // --- UI Components ---
  const renderNav = () => (
    <nav className="flex items-center justify-between p-4 bg-gray-900 border-b border-gray-800">
      <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-indigo-400">AI YouTube Scriptwriter</h1>
      </div>
      <div className="flex-grow flex justify-center items-center gap-4">
        {(['AUTOMATION', 'LIBRARY', 'MANUAL'] as AppView[]).map(v => (
          <button
            key={v}
            onClick={() => { setView(v); setSelectedJobToView(null); resetManualState(); }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              view === v ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            {v.charAt(0) + v.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      <button onClick={() => setIsApiManagerOpen(true)} className="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Open API Key Manager">
          <GearIcon />
      </button>
    </nav>
  );

  const renderScriptContent = (job: ScriptJob | Partial<ScriptJob>) => (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-indigo-400 mb-2">{job.refinedTitle || job.title}</h2>
          <p className="text-gray-400 italic">{job.concept}</p>
        </div>
        <Button 
            onClick={() => handleGenerateThumbnailIdeas(job)} 
            disabled={!job.hook || isGeneratingThumbnailIdeas}
            variant="secondary"
        >
            {isGeneratingThumbnailIdeas ? 'Generating...' : job.thumbnailIdeas ? '💡 View/Regenerate Ideas' : '💡 Generate Thumbnail Ideas'}
        </Button>
      </div>
      
      <CopyControls job={job} totalWords={totalWords} />

      <div className="border-t border-gray-800 pt-6 space-y-6">
        {job.outlines && job.outlines.length > 0 && (
            <div>
                <button 
                  onClick={() => setIsOutlineCollapsed(!isOutlineCollapsed)} 
                  className="w-full flex justify-between items-center text-left text-lg font-semibold text-gray-300 mb-2 hover:text-indigo-400 transition-colors"
                  aria-expanded={!isOutlineCollapsed}
                >
                  Outline
                  <svg className={`w-5 h-5 transition-transform ${isOutlineCollapsed ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                {!isOutlineCollapsed && (
                  <ul className="space-y-2 mt-3">
                      {job.outlines.map(ch => (
                          <li key={ch.id} className={`p-3 rounded-md transition-all duration-300 ${writingChapterIds.includes(ch.id) ? 'bg-indigo-900/50 animate-pulse' : 'bg-gray-800'}`}>
                              <p className="font-semibold text-indigo-300">{`Chapter ${ch.id}: ${ch.title}`} <span className="text-xs text-gray-500 font-normal">{ch.id > 0 && `(${ch.wordCount} words)`}</span></p>
                              <p className="text-sm text-gray-400 ml-4">{ch.concept}</p>
                          </li>
                      ))}
                  </ul>
                )}
            </div>
        )}

        {job.hook && (
          <div>
              <h3 className="text-lg font-semibold text-gray-300 mb-2 border-b border-gray-700 pb-1">Hook</h3>
              <p className="bg-gray-800 p-4 rounded-md whitespace-pre-wrap">{job.hook}</p>
          </div>
        )}

        {job.chaptersContent && job.chaptersContent.length > 0 && (
          <div>
              <h3 className="text-lg font-semibold text-gray-300 mb-2 border-b border-gray-700 pb-1">Chapters</h3>
              <div className="space-y-4">
                {job.chaptersContent.map((content, index) => {
                  const chapterInfo = job.outlines?.find(o => o.id === index + 1);
                  return (
                    <div key={index}>
                      <h4 className="font-semibold text-indigo-300 mb-1">{`Chapter ${index + 1}: ${chapterInfo?.title || ''}`}</h4>
                      <p className="bg-gray-800 p-4 rounded-md whitespace-pre-wrap">{content}</p>
                    </div>
                  )
                })}
              </div>
          </div>
        )}
      </div>
    </div>
  );

  const AutomationView = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left: Input Form */}
        <div className="md:col-span-1 bg-gray-900 p-6 rounded-lg border border-gray-800">
            <h2 className="text-xl font-bold text-indigo-400 mb-4">Add Script to Queue</h2>
            <div className="space-y-4">
                <div>
                    <label htmlFor="auto-title" className="block text-sm font-medium text-gray-400 mb-1">Video Title</label>
                    <input type="text" id="auto-title" value={automationTitle} onChange={e => setAutomationTitle(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                </div>
                <div>
                    <label htmlFor="auto-concept" className="block text-sm font-medium text-gray-400 mb-1">Story Concept</label>
                    <textarea id="auto-concept" value={automationConcept} onChange={e => setAutomationConcept(e.target.value)} rows={4} className="w-full bg-gray-800 border border-gray-700 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"></textarea>
                </div>
                <div>
                    <label htmlFor="auto-duration" className="block text-sm font-medium text-gray-400 mb-1">Video Duration (minutes)</label>
                    <input type="number" id="auto-duration" value={automationDuration} onChange={e => setAutomationDuration(Number(e.target.value))} className="w-full bg-gray-800 border border-gray-700 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                </div>
                <Button onClick={addJobToQueue} className="w-full">Add to Queue</Button>
            </div>
        </div>

        {/* Right: Queue */}
        <div className="md:col-span-2 bg-gray-900 p-6 rounded-lg border border-gray-800">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-indigo-400">Automation Queue</h2>
                <Button onClick={startAutomation} disabled={automationStatus === 'RUNNING' || !jobs.some(j => j.status === 'PENDING')}>
                    {automationStatus === 'RUNNING' ? 'Running...' : 'Start Automation'}
                </Button>
            </div>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                {jobs.filter(j => j.status !== 'DONE').length > 0 ? jobs.filter(j => j.status !== 'DONE').map(job => (
                    <div key={job.id} className="bg-gray-800 p-4 rounded-md flex items-center justify-between">
                        <div>
                            <p className="font-semibold text-gray-200">{job.title}</p>
                            <p className="text-sm text-gray-400">{job.currentTask || job.status}</p>
                            {job.status === 'FAILED' && <p className="text-xs text-red-400 truncate max-w-xs" title={job.error}>Error: {job.error}</p>}
                        </div>
                        <div className="flex gap-2">
                          {job.status === 'FAILED' ? (
                            <Button onClick={() => handleResumeJob(job.id)} variant="primary" className="bg-yellow-600 hover:bg-yellow-500 focus:ring-yellow-500">Resume</Button>
                          ) : (
                            <Button onClick={() => setSelectedJobToView(job)} variant="secondary">View</Button>
                          )}
                          <Button onClick={() => handleDeleteJob(job.id)} variant="secondary" className="bg-red-800 hover:bg-red-700">Delete</Button>
                        </div>
                    </div>
                )) : <p className="text-gray-500 text-center py-4">The queue is empty.</p>}
            </div>
        </div>
    </div>
  );

  const LibraryView = () => {
    const libraryJobs = jobs.filter(j => j.status === 'DONE');
    const visibleJobs = showArchived 
        ? libraryJobs.filter(j => j.libraryStatus === 'ARCHIVED')
        : libraryJobs.filter(j => j.libraryStatus !== 'ARCHIVED');

    return (
        <div className="bg-gray-900 p-6 rounded-lg border border-gray-800">
             <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-indigo-400">Script Library</h2>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={showArchived} onChange={() => setShowArchived(!showArchived)} className="form-checkbox h-5 w-5 bg-gray-800 border-gray-600 rounded text-indigo-600 focus:ring-indigo-500" />
                    <span className="text-gray-300">Show Archived</span>
                </label>
            </div>
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
                {visibleJobs.length > 0 ? visibleJobs.map(job => (
                     <div key={job.id} className="bg-gray-800 p-4 rounded-md flex items-center justify-between">
                        <div>
                            <p className="font-semibold text-gray-200">{job.refinedTitle || job.title}</p>
                            <p className="text-sm text-gray-400">Created: {new Date(job.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={() => setSelectedJobToView(job)} variant="secondary">View</Button>
                            {job.libraryStatus !== 'ARCHIVED' ? (
                                <Button onClick={() => handleArchive(job.id)} variant="secondary">Archive</Button>
                            ) : (
                                <Button onClick={() => handleUnarchive(job.id)} variant="secondary">Unarchive</Button>
                            )}
                             <Button onClick={() => handleDeleteJob(job.id)} variant="secondary" className="bg-red-800 hover:bg-red-700">Delete</Button>
                        </div>
                    </div>
                )) : <p className="text-gray-500 text-center py-4">No {showArchived ? 'archived' : 'available'} scripts found.</p>}
            </div>
        </div>
    );
  };
  
  const ManualView = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      {/* Left Pane: Inputs */}
      <div className="md:col-span-1 bg-gray-900 p-6 rounded-lg border border-gray-800">
        <h2 className="text-xl font-bold text-indigo-400 mb-6">Manual Script Generation</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="manual-title" className="block text-sm font-medium text-gray-400 mb-1">Video Title</label>
            <input
              type="text"
              id="manual-title"
              value={manualTitle}
              onChange={e => setManualTitle(e.target.value)}
              disabled={generationStatus !== GenerationStatus.IDLE}
              className="w-full bg-gray-800 border border-gray-700 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="manual-concept" className="block text-sm font-medium text-gray-400 mb-1">Story Concept</label>
            <textarea
              id="manual-concept"
              value={manualConcept}
              onChange={e => setManualConcept(e.target.value)}
              rows={5}
              disabled={generationStatus !== GenerationStatus.IDLE}
              className="w-full bg-gray-800 border border-gray-700 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-50"
            ></textarea>
          </div>
          <div>
            <label htmlFor="manual-duration" className="block text-sm font-medium text-gray-400 mb-1">Video Duration (minutes)</label>
            <input
              type="number"
              id="manual-duration"
              value={manualDuration}
              onChange={e => setManualDuration(Number(e.target.value))}
              disabled={generationStatus !== GenerationStatus.IDLE}
              className="w-full bg-gray-800 border border-gray-700 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-50"
            />
          </div>
          <div className="pt-6 flex flex-col items-center space-y-4">
            <Button
              onClick={handleManualOneClickGenerate}
              disabled={generationStatus !== GenerationStatus.IDLE || !manualTitle.trim() || !manualConcept.trim()}
            >
              Generate Full Script
            </Button>
            <button
                onClick={resetManualState}
                className="text-gray-500 hover:text-gray-300 text-sm transition-colors disabled:opacity-50"
                disabled={generationStatus !== GenerationStatus.IDLE && manualStep === AppStep.INITIAL}
            >
                Reset
            </button>
          </div>
          {error && <p className="mt-4 text-red-400 text-sm">{error}</p>}
        </div>
      </div>

      {/* Right Pane: Output */}
      <div className="md:col-span-2 bg-gray-900 p-6 rounded-lg border border-gray-800 min-h-[60vh]">
        {manualStep === AppStep.INITIAL && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Enter a title, concept, and duration to begin.</p>
          </div>
        )}
        {(manualStep > AppStep.INITIAL || generationStatus !== GenerationStatus.IDLE) && (
          <div>
            {(generationStatus === GenerationStatus.RUNNING || generationStatus === GenerationStatus.PAUSED) && (
              <ManualProgressTracker
                outlines={manualScriptData.outlines || []}
                currentTask={currentTask}
                generationStatus={generationStatus}
                hookGenerated={!!manualScriptData.hook}
                chaptersGeneratedCount={manualScriptData.chaptersContent?.length || 0}
              />
            )}
            
            {manualScriptData.rawOutlineText ? (
                <div className="mt-8">
                  {renderScriptContent(manualScriptData)}
                </div>
            ) : (
                generationStatus === GenerationStatus.RUNNING && <InlineLoader message={currentTask} />
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (!isAuthenticated) {
    return <PasswordProtection onAuthenticate={handleAuthentication} />;
  }

  return (
    <div className="min-h-screen">
      {renderNav()}
      <main className="p-8">
        {selectedJobToView ? (
             <div className="bg-gray-900 p-6 rounded-lg border border-gray-800">
                <Button onClick={() => setSelectedJobToView(null)} variant="secondary" className="mb-4">← Back to List</Button>
                {renderScriptContent(selectedJobToView)}
             </div>
        ) : (
            <>
                {view === 'MANUAL' && <ManualView />}
                {view === 'AUTOMATION' && <AutomationView />}
                {view === 'LIBRARY' && <LibraryView />}
            </>
        )}
      </main>
      <GenerationControls
        status={automationStatus === 'IDLE' ? generationStatus : (automationStatus === 'RUNNING' ? GenerationStatus.RUNNING : GenerationStatus.PAUSED)}
        onPause={handlePause}
        onResume={handleResume}
        onStop={handleStop}
        currentTask={currentTask}
        progress={progress}
      />
      <ApiKeyManager
        isOpen={isApiManagerOpen}
        onClose={() => setIsApiManagerOpen(false)}
        apiKeys={apiKeys}
        setApiKeys={setApiKeys}
      />
      <ThumbnailIdeasModal
        isOpen={isThumbnailModalOpen}
        onClose={() => setIsThumbnailModalOpen(false)}
        ideas={jobToDisplay?.thumbnailIdeas || null}
        isLoadingIdeas={isGeneratingThumbnailIdeas}
        isLoadingImage={isGeneratingThumbnailImage}
        onReanalyze={() => handleGenerateThumbnailIdeas(jobToDisplay!, true)}
        onGenerateImage={handleGenerateThumbnailImage}
        thumbnailImageUrls={jobToDisplay?.thumbnailImageUrls || null}
      />
    </div>
  );
};

export default App;