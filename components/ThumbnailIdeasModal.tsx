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
  onGenerateImage: (config: { prompt: string; text?: string; addText?: boolean; baseImage?: string }) => void;
  thumbnailImageUrls: string[] | null;
}

const ThumbnailIdeasModal: React.FC<ThumbnailIdeasModalProps> = ({ 
  isOpen, 
  onClose, 
  ideas, 
  isLoadingIdeas, 
  isLoadingImage,
  onReanalyze, 
  onGenerateImage,
  thumbnailImageUrls
}) => {
  const [prompt, setPrompt] = useState('');
  const [text, setText] = useState('');
  const [addTextOverlay, setAddTextOverlay] = useState(true);
  const [editPrompt, setEditPrompt] = useState('');

  useEffect(() => {
    if (ideas) {
      setPrompt(ideas.image_generation_prompt);
      setText(ideas.text_on_thumbnail);
    }
    // Reset edit prompt when modal re-opens or ideas change
    setEditPrompt('');
  }, [ideas, isOpen]);

  if (!isOpen) return null;

  const handleGenerateClick = () => {
    onGenerateImage({ prompt, text, addText: addTextOverlay });
  };
  
  const handleGenerateVariationClick = () => {
    if (!editPrompt.trim() || !thumbnailImageUrls || thumbnailImageUrls.length === 0) return;
    const baseImage = thumbnailImageUrls[thumbnailImageUrls.length - 1];
    onGenerateImage({ prompt: editPrompt, baseImage });
    setEditPrompt(''); // Clear after submitting
  };
  
  const handleDownload = (imageUrl: string, index: number) => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `thumbnail_${index + 1}.jpeg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasImages = thumbnailImageUrls && thumbnailImageUrls.length > 0;

  return (
    <div
      className="fixed inset-0 bg-gray-900 bg-opacity-80 flex items-center justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="thumbnailIdeasTitle"
    >
      <div
        className="bg-gray-800 rounded-lg shadow-2xl p-6 w-full max-w-6xl relative text-gray-200"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="thumbnailIdeasTitle" className="text-2xl font-bold text-indigo-400 mb-4">Thumbnail Workshop</h2>
        
        {isLoadingIdeas && <InlineLoader message="Generating creative thumbnail concepts..." />}

        {!isLoadingIdeas && !ideas && (
            <p className="text-gray-500 text-center py-4">Could not generate ideas. Please try again.</p>
        )}
        
        {!isLoadingIdeas && ideas && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Prompts & Controls */}
                <div className="space-y-4 flex flex-col">
                    <div>
                        <label htmlFor="image_prompt" className="block text-sm font-medium text-gray-400 mb-1">Image Generation Prompt</label>
                        <textarea
                            id="image_prompt"
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            rows={8}
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
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="addText"
                            checked={addTextOverlay}
                            onChange={(e) => setAddTextOverlay(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor="addText" className="text-sm text-gray-300">Add text to image</label>
                    </div>
                     <Button onClick={handleGenerateClick} variant="primary" disabled={isLoadingImage || !prompt}>
                        {hasImages ? 'Generate Another Initial Image' : 'Generate Thumbnail'}
                    </Button>
                    
                    {hasImages && (
                        <div className="pt-4 border-t border-gray-700 space-y-2">
                             <label htmlFor="edit_prompt" className="block text-sm font-medium text-gray-400 mb-1">Describe changes for the latest image</label>
                            <textarea
                                id="edit_prompt"
                                value={editPrompt}
                                onChange={e => setEditPrompt(e.target.value)}
                                rows={3}
                                placeholder="e.g., make the woman's suit red, add rain, change the setting to nighttime"
                                className="w-full bg-gray-900 border border-gray-700 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
                            />
                            <Button onClick={handleGenerateVariationClick} variant="secondary" disabled={isLoadingImage || !editPrompt.trim()}>
                                Generate Variation
                            </Button>
                        </div>
                    )}
                </div>

                {/* Right: Image Preview */}
                <div className="flex flex-col">
                     <label className="block text-sm font-medium text-gray-400 mb-1">Generated Thumbnails</label>
                     <div className="flex-grow bg-gray-900 rounded-md border border-gray-700 p-2 min-h-[300px] max-h-[60vh] overflow-y-auto">
                        {!hasImages && !isLoadingImage && (
                            <div className="flex items-center justify-center h-full">
                                <p className="text-gray-600 text-sm">Images will appear here</p>
                            </div>
                        )}
                        <div className="space-y-4">
                            {thumbnailImageUrls?.map((url, index) => (
                                <div key={index} className="relative group">
                                    <img src={url} alt={`Generated thumbnail ${index + 1}`} className="w-full h-full object-cover rounded-md" />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <Button onClick={() => handleDownload(url, index)}>Download</Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {isLoadingImage && (
                            <div className="flex items-center justify-center h-full">
                                <InlineLoader message="Generating image..." />
                            </div>
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
            <Button onClick={onClose} variant="secondary">Close</Button>
        </div>
      </div>
    </div>
  );
};

export default ThumbnailIdeasModal;