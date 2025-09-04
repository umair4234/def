export interface ChapterOutline {
  id: number;
  title: string;
  wordCount: number;
  concept: string;
}

export enum AppStep {
  INITIAL,
  OUTLINES_GENERATED,
  HOOK_GENERATED,
}

export enum GenerationStatus {
  IDLE,
  RUNNING,
  PAUSED,
  DONE,
}

// New types for Automation and Library
export type AppView = 'MANUAL' | 'AUTOMATION' | 'LIBRARY';

export type AutomationJobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';

export interface ScriptJob {
  id: string;
  source: 'MANUAL' | 'AUTOMATION';
  // Inputs
  title: string;
  concept: string;
  duration: number;
  // Status & Metadata
  status: AutomationJobStatus;
  createdAt: number;
  error?: string;
  // Generated Content
  rawOutlineText: string;
  refinedTitle: string;
  outlines: ChapterOutline[];
  hook: string;
  chaptersContent: string[];
  // Progress Tracking
  currentTask?: string;
  wordsWritten?: number;
  totalWords?: number;
}