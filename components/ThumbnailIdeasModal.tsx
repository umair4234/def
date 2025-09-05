import React, { useState, useEffect } from 'react';
import Button from './Button';
import { ThumbnailIdeas } from '../types';
import InlineLoader from './InlineLoader';

interface ThumbnailIdeasModalProps {
  isOpen: boolean;
  onClose: () => void;
  ideas: ThumbnailIdeas | null;
  isLoadingIdeas: boolean;
  isLoadingImage: boolean;
  onReanalyze: () => void;
  onGenerateImage: (prompt: string, text: string) => void;
  thumbnailImageUrl: string | null;
}

const ThumbnailIdeasModal: React.FC<ThumbnailIdeasModalProps> = ({ 
  isOpen, 
  onClose, 
  ideas, 
  isLoadingIdeas, 
  isLoadingImage,
  onReanalyze, 
  onGenerateImage,
  thumbnailImageUrl
}) => {
  const [prompt, setPrompt] = useState('');
  const [text, setText] = useState('');

  useEffect(() => {
    if (ideas) {
      setPrompt(ideas.image_generation_prompt);
      setText(ideas.text_on_thumbnail);
    }
  }, [ideas]);

  if (!isOpen) return null;

  const handleGenerateClick = () => {
    onGenerateImage(prompt, text);
  };

  return (
    <div
      className="fixed inset-0 bg-gray-900 bg-opacity-80 flex items-center justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="thumbnailIdeasTitle"
    >
      <div
        className="bg-gray-800 rounded-lg shadow-2xl p-6 w-full max-w-4xl relative text-gray-200"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="thumbnailIdeasTitle" className="text-2xl font-bold text-indigo-400 mb-4">Thumbnail Workshop</h2>
        
        {isLoadingIdeas && <InlineLoader message="Generating creative thumbnail concepts..." />}

        {!isLoadingIdeas && !ideas && (
            <p className="text-gray-500 text-center py-4">Could not generate ideas. Please try again.</p>
        )}
        
        {!isLoadingIdeas && ideas && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: Prompts & Controls */}
                <div className="space-y-4">
                    <div>
                        <label htmlFor="image_prompt" className="block text-sm font-medium text-gray-400 mb-1">Image Generation Prompt</label>
                        <textarea
                            id="image_prompt"
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            rows={10}
                            className="w-full bg-gray-900 border border-gray-700 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
                        />
                    </div>
                     <div>
                        <label htmlFor="text_on_thumbnail" className="block text-sm font-medium text-gray-400 mb-1">Text on Thumbnail</label>
                        <textarea
                            id="text_on_thumbnail"
                            value={text}
                            onChange={e => setText(e.target.value)}
                            rows={2}
                             className="w-full bg-gray-900 border border-gray-700 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-bold uppercase"
                        />
                    </div>
                </div>

                {/* Right: Image Preview */}
                <div className="flex flex-col">
                     <label className="block text-sm font-medium text-gray-400 mb-1">Generated Thumbnail</label>
                     <div className="flex-grow aspect-video bg-gray-900 rounded-md border border-gray-700 flex items-center justify-center">
                        {isLoadingImage ? (
                            <InlineLoader message="Generating image..." />
                        ) : thumbnailImageUrl ? (
                            <img src={thumbnailImageUrl} alt="Generated thumbnail" className="w-full h-full object-cover rounded-md" />
                        ) : (
                            <p className="text-gray-600 text-sm">Image will appear here</p>
                        )}
                     </div>
                </div>
            </div>
        )}

        <div className="mt-6 flex justify-between items-center gap-4">
            <div>
                 {!isLoadingIdeas && ideas && (
                    <Button onClick={onReanalyze} variant="secondary" disabled={isLoadingImage}>
                        Re-analyze Concepts
                    </Button>
                 )}
            </div>
            <div className="flex items-center gap-4">
                <Button onClick={handleGenerateClick} variant="primary" disabled={isLoadingImage || isLoadingIdeas || !prompt || !text}>
                    {isLoadingImage ? 'Generating...' : 'Generate Thumbnail'}
                </Button>
                <Button onClick={onClose} variant="secondary">Close</Button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ThumbnailIdeasModal;
