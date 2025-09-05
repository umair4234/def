import React from 'react';
import Button from './Button';
import { ThumbnailIdeas } from '../types';
import InlineLoader from './InlineLoader';

interface ThumbnailIdeasModalProps {
  isOpen: boolean;
  onClose: () => void;
  ideas: ThumbnailIdeas | null;
  isLoading: boolean;
  onReanalyze: () => void;
}

const ThumbnailIdeasModal: React.FC<ThumbnailIdeasModalProps> = ({ isOpen, onClose, ideas, isLoading, onReanalyze }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-gray-900 bg-opacity-80 flex items-center justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="thumbnailIdeasTitle"
    >
      <div
        className="bg-gray-800 rounded-lg shadow-2xl p-6 w-full max-w-lg relative text-gray-200"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="thumbnailIdeasTitle" className="text-2xl font-bold text-indigo-400 mb-4">Thumbnail Ideas</h2>

        {isLoading && <InlineLoader message="Generating creative thumbnail ideas..." />}

        {!isLoading && ideas && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-300 mb-2 border-b border-gray-700 pb-1">Theme</h3>
              <p className="bg-gray-900 p-4 rounded-md whitespace-pre-wrap">{ideas.theme}</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-300 mb-2 border-b border-gray-700 pb-1">Text on Thumbnail</h3>
              <p className="bg-gray-900 p-4 rounded-md text-center text-2xl font-extrabold tracking-wider uppercase text-yellow-300" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.7)' }}>
                {ideas.text}
              </p>
            </div>
          </div>
        )}

        {!isLoading && !ideas && (
            <p className="text-gray-500 text-center py-4">Could not generate ideas. Please try again.</p>
        )}

        <div className="mt-6 flex justify-end items-center gap-4">
          {!isLoading && ideas && (
            <Button onClick={onReanalyze} variant="secondary" className="bg-yellow-700 hover:bg-yellow-600 focus:ring-yellow-500">
              Re-analyze
            </Button>
          )}
          <Button onClick={onClose} variant="secondary">Close</Button>
        </div>
      </div>
    </div>
  );
};

export default ThumbnailIdeasModal;
