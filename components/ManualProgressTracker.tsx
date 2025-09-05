import React, { useMemo } from 'react';
import { ChapterOutline, GenerationStatus } from '../types';

interface ManualProgressTrackerProps {
  outlines: ChapterOutline[];
  currentTask: string;
  generationStatus: GenerationStatus;
  hookGenerated: boolean;
  chaptersGeneratedCount: number;
}

const ManualProgressTracker: React.FC<ManualProgressTrackerProps> = ({ outlines, currentTask, generationStatus, hookGenerated, chaptersGeneratedCount }) => {
  const steps = useMemo(() => {
    if (!outlines || outlines.length === 0) return [];
    const chapterSteps = outlines
      .filter(o => o.id > 0)
      .map(o => `Chapter ${o.id}`);
    return ['Outline', 'Hook', ...chapterSteps];
  }, [outlines]);

  let currentStepIndex = -1;

  if (generationStatus === GenerationStatus.DONE) {
    currentStepIndex = steps.length;
  } else if (currentTask.toLowerCase().includes('chapter')) {
    // The hook is at index 1, so chapters start at index 2.
    // The index of the current chapter being written is 1 (for hook) + chapters already done.
    currentStepIndex = 1 + chaptersGeneratedCount;
  } else if (currentTask.toLowerCase().includes('hook') || hookGenerated) {
    currentStepIndex = 1;
  } else if (currentTask.toLowerCase().includes('outline') || outlines.length > 0) {
    currentStepIndex = 0;
  }

  if (steps.length === 0) return null;

  return (
    <div className="w-full mb-8">
      <h3 className="text-lg font-semibold text-gray-300 mb-4 text-center">Generation Progress</h3>
      <div className="flex items-center">
        {steps.map((step, index) => {
          const isCompleted = index < currentStepIndex;
          const isInProgress = index === currentStepIndex && generationStatus === GenerationStatus.RUNNING;

          return (
            <React.Fragment key={step}>
              {/* Step */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                    isCompleted ? 'bg-indigo-600 border-indigo-500' :
                    isInProgress ? 'bg-yellow-500 border-yellow-400 animate-pulse' :
                    'bg-gray-700 border-gray-600'
                  }`}
                >
                  {isCompleted ? (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                  ) : (
                    <span className={`font-bold ${isInProgress ? 'text-gray-900' : 'text-gray-400'}`}>
                      {index > 1 ? index - 1 : ''}
                    </span>
                  )}
                </div>
                <p className={`mt-2 text-xs text-center font-medium ${
                    isCompleted ? 'text-indigo-300' :
                    isInProgress ? 'text-yellow-300' :
                    'text-gray-500'
                }`}>
                  {step}
                </p>
              </div>

              {/* Connecting Line */}
              {index < steps.length - 1 && (
                <div className={`flex-1 h-1 transition-colors duration-500 ${isCompleted ? 'bg-indigo-600' : 'bg-gray-700'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default ManualProgressTracker;