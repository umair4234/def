import React, { useState } from 'react';
import Button from './Button';
import { ScriptJob } from '../types';

interface CopyControlsProps {
  job: Partial<ScriptJob>;
  totalWords: number;
}

const CopyControls: React.FC<CopyControlsProps> = ({ job, totalWords }) => {
  const [copyState, setCopyState] = useState<'full' | 'hook' | 'rest' | ''>('');

  const handleCopy = (type: 'full' | 'hook' | 'rest') => {
    let textToCopy = '';
    const { hook, chaptersContent = [] } = job;

    const cleanContent = (arr: string[]) => arr.join('\n\n');

    switch (type) {
      case 'full':
        textToCopy = `${hook || ''}\n\n${cleanContent(chaptersContent)}`;
        break;
      case 'hook':
        textToCopy = `${hook || ''}\n\n${chaptersContent[0] || ''}`;
        break;
      case 'rest':
        textToCopy = cleanContent(chaptersContent.slice(1));
        break;
    }

    navigator.clipboard.writeText(textToCopy.trim()).then(() => {
      setCopyState(type);
      setTimeout(() => setCopyState(''), 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      alert('Failed to copy text.');
    });
  };

  if (!job.hook) return null;

  return (
    <div className="my-6 text-center">
        <p className="text-gray-400 mb-3">Total Words: {totalWords}</p>
        <div className="flex justify-center items-center gap-4">
            <Button onClick={() => handleCopy('full')} variant="primary" disabled={copyState !== ''}>
                {copyState === 'full' ? 'Copied!' : 'Copy Full Script'}
            </Button>
            <Button onClick={() => handleCopy('hook')} variant="secondary" disabled={copyState !== ''}>
                {copyState === 'hook' ? 'Copied!' : 'Copy Hook & Ch. 1'}
            </Button>
            <Button onClick={() => handleCopy('rest')} variant="secondary" disabled={copyState !== ''}>
                {copyState === 'rest' ? 'Copied!' : 'Copy Ch. 2 Onwards'}
            </Button>
        </div>
    </div>
  );
};

export default CopyControls;
