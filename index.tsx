
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type, Modality } from "@google/genai";

// --- Configuration ---

const SYSTEM_VOICE = 'Kore'; // 'Kore' (warm, expressive) or 'Fenrir' (deep, authoritative) for French storytelling
const SAMPLE_RATE = 24000;

// --- Interfaces ---

interface BroadcastPlan {
  mainTopic: string;
  chapters: string[]; // List of sub-topics to cover
  nextPivotTopic: string; // What to talk about after this plan is done
}

interface BroadcastSegment {
  script: string;
  displayTitle: string;
}

// --- Audio Utilities ---

const AudioUtils = {
  decodeBase64: (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  },

  decodePCM: (
    data: Uint8Array,
    ctx: AudioContext
  ): AudioBuffer => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length;
    const buffer = ctx.createBuffer(1, frameCount, SAMPLE_RATE);
    const channelData = buffer.getChannelData(0);
    
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
    }
    return buffer;
  }
};

// --- Agentic Service Layer ---

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const AgentService = {
  /**
   * Agent 1: The Planner
   * Creates a long-term narrative structure for the story.
   */
  async createRunOfShow(topic: string): Promise<BroadcastPlan> {
    const prompt = `
      Rôle : Architecte de Récits - Conteur Maître.
      Tâche : Créer la structure narrative pour une histoire captivante sur : "${topic}".
      
      Objectif : Une épopée profonde avec rebondissements, tension, et révélations progressives.
      
      Instructions :
      1. Découpe en 6-8 "Actes narratifs" suivant une structure de conte (Le Commencement, L'Appel de l'Aventure, Les Épreuves, Le Point de Non-Retour, Les Révélations, L'Apogée, L'Héritage).
      2. Chaque acte révèle une nouvelle dimension de l'histoire.
      3. Choisis un "Récit Connexe" pour continuer après (ex: Napoléon → Alexandre le Grand).
      
      Format JSON :
      {
        "mainTopic": "${topic}",
        "chapters": ["Acte 1: Titre évocateur", ...],
        "nextPivotTopic": "La prochaine histoire"
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mainTopic: { type: Type.STRING },
            chapters: { type: Type.ARRAY, items: { type: Type.STRING } },
            nextPivotTopic: { type: Type.STRING }
          },
          required: ['mainTopic', 'chapters', 'nextPivotTopic']
        }
      }
    });

    const text = response.text || "{}";
    return JSON.parse(text) as BroadcastPlan;
  },

  /**
   * Agent 2: The Researcher
   * Finds dramatic facts and narrative elements using Google Search.
   */
  async researchChapter(chapter: string, mainTopic: string): Promise<string> {
    const prompt = `
      Histoire : ${mainTopic}
      Acte : ${chapter}
      
      Trouve 3-4 éléments narratifs puissants et dramatiques : détails humains, moments de tension, révélations surprenantes, tournants décisifs, anecdotes émotionnelles, dialogues mémorables, scènes visuelles fortes.
    `;

    // Note: Using search requires flash-preview or pro models with tool config
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    // We acturally just want the text synthesis of the research provided by the model
    return response.text || `Recherche sur ${chapter}`;
  },

  /**
   * Agent 3: The Storyteller (Narrator)
   * Synthesizes plan + research into an immersive narrative.
   */
  async writeSegmentScript(
    chapter: string, 
    researchNotes: string, 
    context: string
  ): Promise<BroadcastSegment> {
    const prompt = `
      Tu es un conteur magistral. Tisse un récit captivant et immersif.
      Langue : Français.
      
      Contexte : ${context}
      Acte : ${chapter}
      Éléments : ${researchNotes}

      Directives (50-70s) :
      1. Ton immersif, évocateur, cinématographique - comme raconter une légende au coin du feu.
      2. Descriptions vivantes, détails sensoriels, tension dramatique.
      3. Fais vivre personnages et scènes. Présent de narration pour l'immédiateté.
      4. Crée des images mentales puissantes. Le lecteur doit VOIR et RESSENTIR.
      5. Utilise les éléments de recherche mais raconte comme un grand roman.
      6. Transitions fluides. Pas de "Bonjour", "Au revoir" - tu es au cœur de l'histoire.

      Output JSON :
      {
        "script": "Le texte narratif captivant...",
        "displayTitle": "Titre évocateur (3-6 mots)"
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            script: { type: Type.STRING },
            displayTitle: { type: Type.STRING }
          },
          required: ['script', 'displayTitle']
        }
      }
    });

    return JSON.parse(response.text || "{}") as BroadcastSegment;
  },

  /**
   * Agent 4: The Voice
   */
  async generateAudio(text: string): Promise<string> {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: SYSTEM_VOICE },
          },
        },
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];
    if (part?.inlineData?.data) {
      return part.inlineData.data;
    }
    throw new Error("TTS generation failed");
  }
};

// --- Custom Hooks ---

const useAudioStream = () => {
  const ctxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  const init = useCallback(() => {
    if (!ctxRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      ctxRef.current = new AudioContextClass({ sampleRate: SAMPLE_RATE });
      nextStartTimeRef.current = ctxRef.current.currentTime + 0.1;
      setIsPlaying(true);
    } else if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
      setIsPlaying(true);
    }
  }, []);

  const schedule = useCallback(async (base64Data: string) => {
    if (!ctxRef.current) return;

    try {
      const pcmBytes = AudioUtils.decodeBase64(base64Data);
      const audioBuffer = AudioUtils.decodePCM(pcmBytes, ctxRef.current);
      
      const source = ctxRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctxRef.current.destination);

      const now = ctxRef.current.currentTime;
      const startTime = Math.max(nextStartTimeRef.current, now);
      
      source.start(startTime);
      nextStartTimeRef.current = startTime + audioBuffer.duration;
      
      sourceNodesRef.current.push(source);
      source.onended = () => {
        sourceNodesRef.current = sourceNodesRef.current.filter(s => s !== source);
      };
    } catch (e) {
      console.error("Audio scheduling failed", e);
    }
  }, []);

  const stop = useCallback(() => {
    sourceNodesRef.current.forEach(node => {
      try { node.stop(); } catch {}
    });
    sourceNodesRef.current = [];
    
    if (ctxRef.current) {
      ctxRef.current.close();
      ctxRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const getBufferHealth = useCallback(() => {
    if (!ctxRef.current) return 0;
    return nextStartTimeRef.current - ctxRef.current.currentTime;
  }, []);

  return { init, schedule, stop, isPlaying, getBufferHealth };
};

const useBroadcastEngine = (
  audioStream: ReturnType<typeof useAudioStream>
) => {
  const [isLive, setIsLive] = useState(false);
  const [currentSegment, setCurrentSegment] = useState<BroadcastSegment | null>(null);
  const [status, setStatus] = useState<string>('Prêt à raconter');
  
  const stateRef = useRef({
    shouldStop: false,
    topic: '',
    plan: null as BroadcastPlan | null,
    chapterIndex: 0
  });

  const stopBroadcast = useCallback(() => {
    stateRef.current.shouldStop = true;
    audioStream.stop();
    setIsLive(false);
    setCurrentSegment(null);
    setStatus('Histoire interrompue');
  }, [audioStream]);

  const startBroadcast = useCallback(async (initialTopic: string) => {
    if (isLive) return;

    stateRef.current.shouldStop = false;
    stateRef.current.topic = initialTopic;
    stateRef.current.plan = null;
    stateRef.current.chapterIndex = 0;
    
    setIsLive(true);
    setStatus('Préparation du récit...');
    audioStream.init();
    
    runDeepDiveLoop();
  }, [isLive, audioStream]);

  const runDeepDiveLoop = async () => {
    let currentTopic = stateRef.current.topic;

    while (!stateRef.current.shouldStop) {
      try {
        // --- Phase 1: Planning (if needed) ---
        if (!stateRef.current.plan) {
          setStatus(`Structuration du récit : ${currentTopic}...`);
          const plan = await AgentService.createRunOfShow(currentTopic);
          if (stateRef.current.shouldStop) break;
          stateRef.current.plan = plan;
          stateRef.current.chapterIndex = 0;
          console.log("New Story Plan Created:", plan);
        }

        const plan = stateRef.current.plan!;
        
        // Check if we finished the plan
        if (stateRef.current.chapterIndex >= plan.chapters.length) {
          // Pivot to next topic
          currentTopic = plan.nextPivotTopic;
          stateRef.current.plan = null;
          continue; // Loop back to planning
        }

        // --- Phase 2: Production (Research & Write) ---
        const currentChapter = plan.chapters[stateRef.current.chapterIndex];
        
        // Update Status only if we are low on buffer (otherwise keep "Histoire en Cours")
        if (audioStream.getBufferHealth() < 5) {
          setStatus(`Exploration : ${currentChapter}...`);
        }

        // Parallelize Research & Writing? 
        // No, writing depends on research. Sequential agent chain.
        
        // Agent 2: Research
        const researchData = await AgentService.researchChapter(currentChapter, plan.mainTopic);
        if (stateRef.current.shouldStop) break;

        // Agent 3: Write
        if (audioStream.getBufferHealth() < 5) setStatus(`Tissage du récit...`);
        const segment = await AgentService.writeSegmentScript(
          currentChapter,
          researchData,
          `Histoire globale: ${plan.mainTopic}. Acte précédent: ${stateRef.current.chapterIndex > 0 ? plan.chapters[stateRef.current.chapterIndex - 1] : "Début de l'histoire"}`
        );
        
        if (stateRef.current.shouldStop) break;
        setCurrentSegment(segment);
        stateRef.current.chapterIndex++; // Advance chapter

        // --- Phase 3: Audio Synthesis ---
        if (audioStream.getBufferHealth() < 5) setStatus(`Narration vocale...`);
        const audioBase64 = await AgentService.generateAudio(segment.script);
        
        if (stateRef.current.shouldStop) break;

        // --- Phase 4: Scheduling ---
        await audioStream.schedule(audioBase64);
        setStatus('HISTOIRE EN COURS');

        // --- Buffer Management ---
        // If we have plenty of audio (e.g. > 60s), wait before generating next segment
        const health = audioStream.getBufferHealth();
        if (health > 60) {
          await new Promise(r => setTimeout(r, 20000));
        }

      } catch (error) {
        console.error("Storytelling Error:", error);
        if (stateRef.current.shouldStop) break;
        setStatus('Moment de pause... Reprise du récit');
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  };

  return { 
    isLive, 
    startBroadcast, 
    stopBroadcast, 
    currentSegment, 
    status 
  };
};

// --- UI Components ---

const Visualizer = ({ active }: { active: boolean }) => (
  <div className="flex items-end justify-center gap-1.5 h-24 w-full opacity-90 my-6">
    {[...Array(12)].map((_, i) => (
      <div
        key={i}
        className={`w-3 bg-indigo-500 rounded-full transition-all duration-300 ease-in-out ${
          active ? 'animate-pulse' : 'h-2'
        }`}
        style={{
          height: active ? `${Math.max(10, Math.random() * 100)}%` : '8px',
          animationDelay: `${i * 0.05}s`,
          animationDuration: '0.4s',
          opacity: active ? 0.8 + Math.random() * 0.2 : 0.3
        }}
      />
    ))}
  </div>
);

const SetupView = ({ onStart }: { onStart: (topic: string) => void }) => {
  const [input, setInput] = useState('');

  return (
    <div className="w-full max-w-xl flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="text-center space-y-4">
        <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-neutral-600 tracking-tighter">
          INFINITE TALES
        </h1>
        <p className="text-neutral-400 text-lg md:text-xl font-light">
          Des histoires infinies. Racontées par l'intelligence artificielle.
        </p>
      </div>

      <div className="space-y-4">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl blur opacity-30 group-hover:opacity-60 transition duration-500"></div>
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && input.trim() && onStart(input)}
            placeholder="Quelle histoire voulez-vous entendre ? (ex: L'Épopée d'Alexandre le Grand)"
            className="relative w-full bg-neutral-900/90 backdrop-blur-xl border border-neutral-800 text-white px-8 py-6 text-xl rounded-xl focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-neutral-600 shadow-2xl"
          />
        </div>
        
        <button
          onClick={() => input.trim() && onStart(input)}
          disabled={!input.trim()}
          className="w-full py-5 bg-white text-black font-bold text-lg rounded-xl hover:bg-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] active:scale-[0.99]"
        >
          Commencer l'histoire
        </button>
      </div>
    </div>
  );
};

const LivePlayerView = ({ 
  segment, 
  status, 
  onStop 
}: { 
  segment: BroadcastSegment | null, 
  status: string, 
  onStop: () => void 
}) => {
  return (
    <div className="w-full max-w-2xl flex flex-col gap-6 animate-in zoom-in-95 duration-500">
      {/* Status Bar */}
      <div className="flex justify-between items-center px-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
          </span>
          <span className="text-xs font-bold tracking-widest text-amber-500 uppercase">Narration en cours</span>
        </div>
        <span className="text-xs font-mono text-neutral-500 uppercase tracking-widest">{status}</span>
      </div>

      {/* Main Card */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden group">
        
        {/* Background Accents */}
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition duration-1000"></div>
        <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl group-hover:bg-purple-500/20 transition duration-1000"></div>

        <div className="relative z-10 flex flex-col items-center text-center gap-6">
          <div className="space-y-2">
            <span className="text-amber-400 text-xs font-bold tracking-[0.2em] uppercase">Acte Actuel</span>
            <h2 className="text-3xl md:text-5xl font-black text-white leading-tight">
              {segment?.displayTitle || "Préparation de l'histoire..."}
            </h2>
          </div>

          <Visualizer active={status === 'HISTOIRE EN COURS'} />

          <div className="w-full bg-neutral-950/50 rounded-xl p-6 border border-white/5 h-64 overflow-y-auto custom-scrollbar text-left">
            <p className="text-neutral-400 font-serif text-lg leading-relaxed whitespace-pre-line">
              {segment?.script || "Le conteur prépare votre histoire..."}
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={onStop}
        className="mx-auto text-neutral-500 hover:text-white transition-colors text-sm font-medium tracking-widest uppercase py-4 border-b border-transparent hover:border-white"
      >
        Interrompre l'histoire
      </button>
    </div>
  );
};

// --- Main App ---

const App = () => {
  const audioStream = useAudioStream();
  const broadcast = useBroadcastEngine(audioStream);

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-indigo-500/30 flex items-center justify-center p-6">
      {!broadcast.isLive ? (
        <SetupView onStart={broadcast.startBroadcast} />
      ) : (
        <LivePlayerView 
          segment={broadcast.currentSegment} 
          status={broadcast.status}
          onStop={broadcast.stopBroadcast}
        />
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('app')!);
root.render(<App />);
