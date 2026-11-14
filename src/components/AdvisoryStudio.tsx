import React, { useEffect, useState } from 'react';
import {
  Baby,
  CheckCircle2,
  Copy,
  HeartPulse,
  Loader2,
  Megaphone,
  Pause,
  Printer,
  ShieldAlert,
  Square,
  Users,
  Volume2,
} from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import type { AppRoute } from './Layout';
import { saveAdvisoryTransaction } from '../db/civicDexie';
import type { AdvisoryLanguage, CitizenAdvisoryRecord, ReadingLevel } from '../types/civic';

const LANGUAGES: AdvisoryLanguage[] = [
  'English',
  'Hindi (हिन्दी)',
  'Hinglish',
  'Marathi (मराठी)',
  'Tamil (தமிழ்)',
  'Bengali (বাংলা)',
];

const READING_LEVELS: Array<{ value: ReadingLevel; label: string }> = [
  { value: 'SIMPLE_PUBLIC_GRADE_5', label: 'Simple Public (Grade 5)' },
  { value: 'CHILD_FRIENDLY_SCHOOL_STORY', label: 'Child-Friendly School Story' },
  { value: 'DETAILED_HEALTH_CIVIC', label: 'Detailed Health & Civic Notice' },
];

export const AdvisoryStudio: React.FC<{ onNavigate: (r: AppRoute) => void }> = ({ onNavigate }) => {
  const { workspace, activeRole, refreshWorkspace, notify } = useStudio();
  const briefings = workspace?.briefings ?? [];
  const advisories = workspace?.advisories ?? [];
  const batches = workspace?.batches ?? [];

  const [briefingId, setBriefingId] = useState<string>(briefings[0]?.id ?? '');
  const [language, setLanguage] = useState<AdvisoryLanguage>('English');
  const [readingLevel, setReadingLevel] = useState<ReadingLevel>('SIMPLE_PUBLIC_GRADE_5');
  const [generating, setGenerating] = useState(false);
  const [activeAdvisoryId, setActiveAdvisoryId] = useState<string>(advisories[0]?.id ?? '');
  const [speakingState, setSpeakingState] = useState<'idle' | 'speaking' | 'paused'>('idle');
  const [speechSupported] = useState<boolean>(
    typeof window !== 'undefined' && 'speechSynthesis' in window
  );

  useEffect(() => {
    if (!briefingId && briefings[0]) setBriefingId(briefings[0].id);
  }, [briefings, briefingId]);

  useEffect(() => {
    if (!activeAdvisoryId && advisories[0]) setActiveAdvisoryId(advisories[0].id);
  }, [advisories, activeAdvisoryId]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const activeAdvisory: CitizenAdvisoryRecord | null =
    advisories.find((a) => a.id === activeAdvisoryId) ?? advisories[0] ?? null;

  const handleGenerate = async () => {
    if (!briefingId || !activeRole) {
      notify('error', 'Generate a civic briefing first.');
      return;
    }
    const briefing = briefings.find((b) => b.id === briefingId);
    const batch = briefing ? batches.find((b) => b.id === briefing.batchId) : null;
    if (!briefing || !batch) {
      notify('error', 'Source briefing not found.');
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch('/api/advisories/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          briefing,
          batch,
          language,
          readingLevel,
          createdBy: activeRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify('error', data.error || 'Advisory generation failed.');
        return;
      }
      await saveAdvisoryTransaction(activeRole, data.advisory);
      await refreshWorkspace();
      setActiveAdvisoryId(data.advisory.id);
      notify('success', `Generated ${data.advisory.language} advisory.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to generate citizen advisory.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSpeak = () => {
    if (!activeAdvisory) return;
    if (!speechSupported) {
      notify('info', 'Speech synthesis is unavailable in this browser.');
      return;
    }
    if (speakingState === 'paused') {
      window.speechSynthesis.resume();
      setSpeakingState('speaking');
      return;
    }

    window.speechSynthesis.cancel();
    const text = [
      activeAdvisory.headline,
      activeAdvisory.currentSituation,
      activeAdvisory.outdoorAndWindowGuidance,
      activeAdvisory.childrenCareSection,
      activeAdvisory.olderAdultsCareSection,
      activeAdvisory.sensitiveGroupsCareSection,
    ].join('. ');

    const utterance = new SpeechSynthesisUtterance(text);
    const langMap: Record<AdvisoryLanguage, string> = {
      English: 'en-IN',
      'Hindi (हिन्दी)': 'hi-IN',
      Hinglish: 'en-IN',
      'Marathi (मराठी)': 'mr-IN',
      'Tamil (தமிழ்)': 'ta-IN',
      'Bengali (বাংলা)': 'bn-IN',
    };
    const targetLang = langMap[activeAdvisory.language];
    const voices = window.speechSynthesis.getVoices();
    const matchingVoice = voices.find((v) =>
      v.lang.toLowerCase().startsWith(targetLang.split('-')[0].toLowerCase())
    );
    if (matchingVoice) {
      utterance.voice = matchingVoice;
      utterance.lang = matchingVoice.lang;
    } else {
      utterance.lang = 'en-IN';
    }

    utterance.onend = () => setSpeakingState('idle');
    utterance.onerror = () => setSpeakingState('idle');
    setSpeakingState('speaking');
    window.speechSynthesis.speak(utterance);
  };

  const handlePauseSpeech = () => {
    if (!speechSupported) return;
    window.speechSynthesis.pause();
    setSpeakingState('paused');
  };

  const handleStopSpeech = () => {
    if (!speechSupported) return;
    window.speechSynthesis.cancel();
    setSpeakingState('idle');
  };

  const handleCopyAdvisory = async () => {
    if (!activeAdvisory) return;
    try {
      await navigator.clipboard.writeText(activeAdvisory.whatsappReadyText);
      notify('success', 'Advisory copied to clipboard.');
    } catch {
      notify('error', 'Clipboard unavailable.');
    }
  };

  if (briefings.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-xl mx-auto mt-8 space-y-3">
        <Megaphone className="w-9 h-9 text-blue-700 mx-auto" aria-hidden="true" />
        <h1 className="text-lg font-bold text-slate-900">Generate a Briefing First</h1>
        <p className="text-sm text-slate-600">
          Citizen advisories translate a verified briefing into local languages and reading levels.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('/briefing-studio')}
          className="px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800"
        >
          Open Briefing Studio
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <h1 className="text-xl font-bold text-slate-900">Citizen Advisory</h1>
        {activeAdvisory && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSpeak}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800"
            >
              <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{speakingState === 'paused' ? 'Resume' : 'Listen'}</span>
            </button>
            {speakingState === 'speaking' && (
              <button
                type="button"
                onClick={handlePauseSpeech}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-300 bg-white rounded-lg"
              >
                <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Pause</span>
              </button>
            )}
            {speakingState !== 'idle' && (
              <button
                type="button"
                onClick={handleStopSpeech}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-300 bg-white rounded-lg"
              >
                <Square className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Stop</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleCopyAdvisory()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-300 bg-white text-slate-800 rounded-lg hover:bg-slate-50"
            >
              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Copy</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800"
            >
              <Printer className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Print</span>
            </button>
          </div>
        )}
      </div>

      {/* Focused Generator Bar */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 no-print space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label htmlFor="adv-brief-select" className="block text-xs font-medium text-slate-700 mb-1">
              Source Briefing
            </label>
            <select
              id="adv-brief-select"
              value={briefingId}
              onChange={(e) => setBriefingId(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-900"
            >
              {briefings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.briefingCode} · {b.personaRole.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="adv-lang-select" className="block text-xs font-medium text-slate-700 mb-1">
              Language
            </label>
            <select
              id="adv-lang-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value as AdvisoryLanguage)}
              className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-900"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="adv-level-select" className="block text-xs font-medium text-slate-700 mb-1">
              Reading Level
            </label>
            <select
              id="adv-level-select"
              value={readingLevel}
              onChange={(e) => setReadingLevel(e.target.value as ReadingLevel)}
              className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-900"
            >
              {READING_LEVELS.map((rl) => (
                <option key={rl.value} value={rl.value}>
                  {rl.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <button
              type="button"
              disabled={generating}
              onClick={() => void handleGenerate()}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-60"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Megaphone className="w-4 h-4" aria-hidden="true" />
                  <span>Generate Advisory</span>
                </>
              )}
            </button>
          </div>
        </div>

        {advisories.length > 0 && (
          <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-500">Generated:</span>
            {advisories.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setActiveAdvisoryId(a.id)}
                className={`px-2 py-1 rounded border ${
                  a.id === activeAdvisory?.id
                    ? 'bg-blue-50 border-blue-300 text-blue-900 font-semibold'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {a.language} · {a.readingLevel.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        )}
      </section>

      {activeAdvisory && (
        <article className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="border-b border-slate-200 pb-3">
            <div className="text-[11px] font-mono text-slate-500">
              {activeAdvisory.language} · {activeAdvisory.readingLevel.replace(/_/g, ' ')} · {activeAdvisory.geminiModel} · {activeAdvisory.latencyMs} ms
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-1">{activeAdvisory.headline}</h2>
          </div>

          <div className="space-y-3 text-sm text-slate-800 leading-relaxed">
            <p className="font-medium text-slate-900">{activeAdvisory.currentSituation}</p>
            <p className="text-slate-700">{activeAdvisory.pastPresentProjectionSummary}</p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-950">
              <span className="font-semibold">Outdoor &amp; Window Timing:</span>{' '}
              {activeAdvisory.outdoorAndWindowGuidance}
            </div>
          </div>

          {/* Child / Older Adult / Sensitive-Group Sections */}
          <section aria-label="Care guidance for vulnerable groups" className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="border border-slate-200 rounded-lg p-3.5 space-y-1 bg-slate-50/70">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 uppercase">
                <Baby className="w-4 h-4 text-blue-700" aria-hidden="true" />
                <span>Children</span>
              </div>
              <p className="text-xs text-slate-800 leading-relaxed">{activeAdvisory.childrenCareSection}</p>
            </div>

            <div className="border border-slate-200 rounded-lg p-3.5 space-y-1 bg-slate-50/70">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 uppercase">
                <Users className="w-4 h-4 text-amber-700" aria-hidden="true" />
                <span>Older Adults</span>
              </div>
              <p className="text-xs text-slate-800 leading-relaxed">{activeAdvisory.olderAdultsCareSection}</p>
            </div>

            <div className="border border-slate-200 rounded-lg p-3.5 space-y-1 bg-slate-50/70">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 uppercase">
                <HeartPulse className="w-4 h-4 text-red-700" aria-hidden="true" />
                <span>Sensitive Groups</span>
              </div>
              <p className="text-xs text-slate-800 leading-relaxed">{activeAdvisory.sensitiveGroupsCareSection}</p>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="border border-emerald-200 bg-emerald-50/40 rounded-lg p-3.5 space-y-1.5">
              <h3 className="font-bold text-emerald-950 uppercase flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                <span>Do</span>
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-emerald-950">
                {activeAdvisory.dosAndDonts.dos.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>

            <div className="border border-red-200 bg-red-50/40 rounded-lg p-3.5 space-y-1.5">
              <h3 className="font-bold text-red-950 uppercase flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-red-700" aria-hidden="true" />
                <span>Avoid</span>
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-red-950">
                {activeAdvisory.dosAndDonts.donts.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Shareable Advisory Text
            </h3>
            <pre className="whitespace-pre-wrap text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-800">
              {activeAdvisory.whatsappReadyText}
            </pre>
          </section>

          <footer className="text-[11px] text-slate-500 border-t border-slate-200 pt-2">
            {activeAdvisory.disclaimer}
          </footer>
        </article>
      )}
    </div>
  );
};
