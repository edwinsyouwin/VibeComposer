'use client';

import { useState, useCallback } from 'react';
import { useVideoStore, type VideoProvider } from '@/lib/video/videoStore';
import { VideoTimeline } from './VideoTimeline';
import { SectionStyleEditor } from './SectionStyleEditor';

const GENRES = [
  { value: '', label: 'Auto-detect' },
  { value: 'melodic-techno', label: 'Melodic Techno' },
  { value: 'afro-tech', label: 'Afro Tech' },
  { value: 'jersey-club', label: 'Jersey Club' },
  { value: 'space-bass', label: 'Space Bass' },
  { value: 'pop-edm', label: 'Pop-EDM' },
];

const PROVIDERS: { value: VideoProvider; label: string; maxDuration: string }[] = [
  { value: 'seedance', label: 'Seedance 2.0', maxDuration: '15s' },
  { value: 'runway', label: 'Runway Gen-4', maxDuration: '10s' },
  { value: 'kling', label: 'Kling 2.6', maxDuration: '10s' },
];

const NARRATIVE_PRESETS = [
  'Cyberpunk city at night with neon reflections',
  'Desert journey through ancient ruins at golden hour',
  'Deep ocean bioluminescent world',
  'Abstract flowing liquid metal and light',
  'Space station orbiting a gas giant',
  'Forest of glowing crystalline trees',
  'Underground rave in an abandoned cathedral',
  'Floating islands above clouds at sunrise',
];

/**
 * Main control panel for music video generation.
 * Handles the full workflow: upload → analyze → configure → generate.
 */
export function VideoGeneratorPanel() {
  const store = useVideoStore();
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAudioFile(file);
    store.setAudioFilePath(file.name);
    store.setStage('analyzing');
    setIsAnalyzing(true);

    try {
      const formData = new FormData();
      formData.append('audio', file);

      const response = await fetch('/api/video/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Analysis failed');

      const analysis = await response.json();
      store.setAnalysis(analysis);
      store.setStage('planning');
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Analysis failed');
      store.setStage('failed');
    } finally {
      setIsAnalyzing(false);
    }
  }, [store]);

  const handlePlanVideo = useCallback(async () => {
    if (!store.analysis || !store.narrativeTheme) return;

    store.setStage('planning');

    try {
      const response = await fetch('/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'plan',
          analysis: store.analysis,
          narrativeTheme: store.narrativeTheme,
          genre: store.genre,
        }),
      });

      if (!response.ok) throw new Error('Planning failed');

      const { segments } = await response.json();
      store.setSegments(segments);
      store.setStage('editing');
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Planning failed');
      store.setStage('failed');
    }
  }, [store]);

  const handleGenerate = useCallback(async () => {
    if (store.segments.length === 0 || !store.apiKey) return;

    store.setStage('generating');
    store.setGenerationProgress(0);

    try {
      const response = await fetch('/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          segments: store.segments,
          provider: store.provider,
          apiKey: store.apiKey,
          resolution: store.resolution,
          aspectRatio: store.aspectRatio,
        }),
      });

      if (!response.ok) throw new Error('Generation failed');

      const result = await response.json();
      store.setSegments(result.segments);
      store.setOutputUrl(result.outputUrl);
      store.setStage('completed');
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Generation failed');
      store.setStage('failed');
    }
  }, [store]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Music Video Generator</h2>
        <StageIndicator stage={store.stage} />
      </div>

      {/* Step 1: Audio Upload */}
      <section className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
        <h3 className="text-sm font-medium text-gray-300 mb-3">1. Audio Source</h3>
        <div className="flex gap-3">
          <label className="flex-1 flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-gray-500 transition-colors">
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              className="hidden"
              disabled={isAnalyzing}
            />
            <span className="text-sm text-gray-400">
              {audioFile ? audioFile.name : 'Upload WAV/MP3'}
            </span>
          </label>
          {isAnalyzing && (
            <div className="flex items-center gap-2 text-sm text-amber-400">
              <span className="animate-spin">&#9696;</span>
              Analyzing...
            </div>
          )}
        </div>
      </section>

      {/* Timeline */}
      <VideoTimeline />

      {/* Step 2: Theme & Genre */}
      {store.analysis && (
        <section className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
          <h3 className="text-sm font-medium text-gray-300 mb-3">2. Visual Theme</h3>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Narrative Theme</label>
              <input
                type="text"
                value={store.narrativeTheme}
                onChange={(e) => store.setNarrativeTheme(e.target.value)}
                placeholder="Describe the visual world for your video..."
                className="w-full bg-[#111] border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
              />
              <div className="flex flex-wrap gap-1 mt-2">
                {NARRATIVE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => store.setNarrativeTheme(preset)}
                    className="text-xs px-2 py-1 bg-[#222] border border-gray-700 rounded hover:border-gray-500 text-gray-400 hover:text-white transition-colors"
                  >
                    {preset.slice(0, 30)}...
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Genre Style</label>
                <select
                  value={store.genre}
                  onChange={(e) => store.setGenre(e.target.value)}
                  className="w-full bg-[#111] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  {GENRES.map((g) => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handlePlanVideo}
              disabled={!store.narrativeTheme}
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-medium transition-colors"
            >
              Generate Video Plan
            </button>
          </div>
        </section>
      )}

      {/* Step 3: Edit Segments */}
      {store.segments.length > 0 && store.stage !== 'idle' && (
        <SectionStyleEditor />
      )}

      {/* Step 4: Provider & Generate */}
      {store.segments.length > 0 && (
        <section className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
          <h3 className="text-sm font-medium text-gray-300 mb-3">4. Generate Video</h3>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Video Provider</label>
                <select
                  value={store.provider}
                  onChange={(e) => store.setProvider(e.target.value as VideoProvider)}
                  className="w-full bg-[#111] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label} (max {p.maxDuration})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Resolution</label>
                <select
                  value={store.resolution}
                  onChange={(e) => store.setResolution(e.target.value as '480p' | '720p' | '1080p')}
                  className="w-full bg-[#111] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="480p">480p (Faster)</option>
                  <option value="720p">720p (Balanced)</option>
                  <option value="1080p">1080p (Quality)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Aspect Ratio</label>
                <select
                  value={store.aspectRatio}
                  onChange={(e) => store.setAspectRatio(e.target.value as '16:9' | '9:16' | '4:3' | '1:1')}
                  className="w-full bg-[#111] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="16:9">16:9 (Landscape)</option>
                  <option value="9:16">9:16 (Vertical/Reels)</option>
                  <option value="4:3">4:3 (Classic)</option>
                  <option value="1:1">1:1 (Square)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">API Key</label>
                <input
                  type="password"
                  value={store.apiKey}
                  onChange={(e) => store.setApiKey(e.target.value)}
                  placeholder="Provider API key..."
                  className="w-full bg-[#111] border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Generation progress */}
            {store.stage === 'generating' && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Generating clips...</span>
                  <span>{Math.round(store.generationProgress * 100)}%</span>
                </div>
                <div className="w-full h-2 bg-[#111] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 transition-all duration-300"
                    style={{ width: `${store.generationProgress * 100}%` }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={!store.apiKey || store.stage === 'generating'}
              className="w-full py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-medium transition-colors"
            >
              {store.stage === 'generating' ? 'Generating...' : `Generate ${store.segments.length} Clips & Assemble`}
            </button>
          </div>
        </section>
      )}

      {/* Output */}
      {store.outputUrl && (
        <section className="bg-[#1a1a1a] rounded-lg p-4 border border-green-800">
          <h3 className="text-sm font-medium text-green-400 mb-3">Video Complete</h3>
          <video
            src={store.outputUrl}
            controls
            className="w-full rounded-lg"
          />
        </section>
      )}

      {/* Error display */}
      {store.error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3">
          <p className="text-sm text-red-400">{store.error}</p>
          <button
            onClick={() => store.setError(null)}
            className="text-xs text-red-500 hover:text-red-400 mt-1"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

function StageIndicator({ stage }: { stage: string }) {
  const stageLabels: Record<string, { label: string; color: string }> = {
    idle: { label: 'Ready', color: 'text-gray-500' },
    analyzing: { label: 'Analyzing Audio', color: 'text-amber-400' },
    planning: { label: 'Planning Video', color: 'text-blue-400' },
    editing: { label: 'Edit Prompts', color: 'text-purple-400' },
    generating: { label: 'Generating Clips', color: 'text-amber-400' },
    assembling: { label: 'Assembling Video', color: 'text-cyan-400' },
    completed: { label: 'Complete', color: 'text-green-400' },
    failed: { label: 'Failed', color: 'text-red-400' },
  };

  const info = stageLabels[stage] || stageLabels.idle;

  return (
    <span className={`text-xs font-medium ${info.color}`}>
      {info.label}
    </span>
  );
}
