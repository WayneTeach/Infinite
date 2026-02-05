
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type, Modality } from "@google/genai";

// --- Configuration ---

const SAMPLE_RATE = 24000;

// Language configuration
type Language = 'en' | 'fr';

interface LanguageConfig {
  voice: string;
  placeholderText: string;
  startButton: string;
  stopButton: string;
  readyStatus: string;
  preparingStatus: string;
  structuringStatus: string;
  exploringStatus: string;
  weavingStatus: string;
  narrationStatus: string;
  storyInProgress: string;
  storyInterrupted: string;
  pauseStatus: string;
  currentAct: string;
  preparingStory: string;
  storytellerPreparing: string;
  liveNarration: string;
  selectLanguage: string;
  english: string;
  french: string;
}

const LANGUAGE_CONFIGS: Record<Language, LanguageConfig> = {
  en: {
    voice: 'Kore',
    placeholderText: 'What story would you like to hear? (e.g., The Epic of Alexander the Great)',
    startButton: 'Start the story',
    stopButton: 'Stop the story',
    readyStatus: 'Ready to tell stories',
    preparingStatus: 'Preparing the story...',
    structuringStatus: 'Structuring the narrative',
    exploringStatus: 'Exploring',
    weavingStatus: 'Weaving the tale...',
    narrationStatus: 'Voice narration...',
    storyInProgress: 'STORY IN PROGRESS',
    storyInterrupted: 'Story interrupted',
    pauseStatus: 'Taking a pause... Resuming the story',
    currentAct: 'Current Act',
    preparingStory: 'Preparing the story...',
    storytellerPreparing: 'The storyteller is preparing your story...',
    liveNarration: 'Live Narration',
    selectLanguage: 'Select Language',
    english: 'English',
    french: 'French'
  },
  fr: {
    voice: 'Kore',
    placeholderText: "Quelle histoire voulez-vous entendre ? (ex: L'Épopée d'Alexandre le Grand)",
    startButton: "Commencer l'histoire",
    stopButton: "Interrompre l'histoire",
    readyStatus: 'Prêt à raconter',
    preparingStatus: 'Préparation du récit...',
    structuringStatus: 'Structuration du récit',
    exploringStatus: 'Exploration',
    weavingStatus: 'Tissage du récit...',
    narrationStatus: 'Narration vocale...',
    storyInProgress: 'HISTOIRE EN COURS',
    storyInterrupted: 'Histoire interrompue',
    pauseStatus: 'Moment de pause... Reprise du récit',
    currentAct: 'Acte Actuel',
    preparingStory: "Préparation de l'histoire...",
    storytellerPreparing: 'Le conteur prépare votre histoire...',
    liveNarration: 'Narration en cours',
    selectLanguage: 'Choisir la langue',
    english: 'Anglais',
    french: 'Français'
  }
};

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
  async createRunOfShow(topic: string, language: Language): Promise<BroadcastPlan> {
    const prompts: Record<Language, string> = {
      en: `
You are a MASTER STORY ARCHITECT with decades of experience crafting legendary tales.

YOUR MISSION: Design an unforgettable narrative journey about "${topic}" that will captivate listeners from the first word to the last breath.

STORY PHILOSOPHY:
- Every great story is a TRANSFORMATION - someone or something changes forever
- Tension is the heartbeat of narrative - build it, release it, build it higher
- The best tales blend the universal with the specific - grand themes through intimate moments
- Mystery pulls us forward - always plant questions before you answer them

NARRATIVE STRUCTURE (Create 6-8 acts):
1. THE HOOK - An arresting opening that drops us into a pivotal moment. Start in medias res.
2. THE WORLD - Establish the stakes, the era, the atmosphere. Make us FEEL the setting.
3. THE RISING STORM - Introduce conflict, obstacles, the forces that oppose our subjects.
4. THE CRUCIBLE - The darkest hour, the impossible choice, the moment everything hangs in balance.
5. THE REVELATION - A truth emerges that changes everything we thought we knew.
6. THE TRANSFORMATION - Show how the journey has forever altered the world or the people in it.
7. THE ECHO - What legacy remains? What ripples still touch us today?

Each chapter title should be EVOCATIVE and MYSTERIOUS - not descriptive summaries, but poetic invitations.

CONNECTED TALE: Choose a thematically linked story that shares emotional DNA with this one (parallel struggles, mirror transformations, connected historical threads).

OUTPUT FORMAT:
{
  "mainTopic": "${topic}",
  "chapters": ["Chapter titles that hint at drama without revealing it..."],
  "nextPivotTopic": "A fascinating connected story"
}
      `,
      fr: `
Tu es un MAÎTRE ARCHITECTE DE RÉCITS avec des décennies d'expérience dans la création de contes légendaires.

TA MISSION : Concevoir un voyage narratif inoubliable sur "${topic}" qui captivera les auditeurs du premier mot jusqu'au dernier souffle.

PHILOSOPHIE NARRATIVE :
- Toute grande histoire est une TRANSFORMATION - quelqu'un ou quelque chose change à jamais
- La tension est le battement de cœur du récit - construis-la, libère-la, construis-la plus haut
- Les meilleurs récits mêlent l'universel au particulier - des thèmes grandioses à travers des moments intimes
- Le mystère nous tire vers l'avant - plante toujours des questions avant d'y répondre

STRUCTURE NARRATIVE (Crée 6-8 actes) :
1. L'ACCROCHE - Une ouverture saisissante qui nous plonge dans un moment décisif. Commence in medias res.
2. L'UNIVERS - Établis les enjeux, l'époque, l'atmosphère. Fais-nous RESSENTIR le décor.
3. LA TEMPÊTE MONTANTE - Introduis le conflit, les obstacles, les forces qui s'opposent à nos sujets.
4. LE CREUSET - L'heure la plus sombre, le choix impossible, le moment où tout est en suspens.
5. LA RÉVÉLATION - Une vérité émerge qui change tout ce que nous pensions savoir.
6. LA MÉTAMORPHOSE - Montre comment le voyage a altéré à jamais le monde ou les personnes.
7. L'ÉCHO - Quel héritage demeure ? Quelles ondulations nous touchent encore aujourd'hui ?

Chaque titre de chapitre doit être ÉVOCATEUR et MYSTÉRIEUX - pas des résumés descriptifs, mais des invitations poétiques.

RÉCIT CONNEXE : Choisis une histoire thématiquement liée qui partage l'ADN émotionnel de celle-ci.

FORMAT DE SORTIE :
{
  "mainTopic": "${topic}",
  "chapters": ["Titres de chapitres qui suggèrent le drame sans le révéler..."],
  "nextPivotTopic": "Une histoire connexe fascinante"
}
      `
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompts[language],
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
  async researchChapter(chapter: string, mainTopic: string, language: Language): Promise<string> {
    const prompts: Record<Language, string> = {
      en: `
You are a STORY RESEARCHER specializing in finding the gold - the details that transform information into unforgettable narrative.

STORY: ${mainTopic}
CURRENT CHAPTER: ${chapter}

YOUR MISSION: Unearth 4-5 EXTRAORDINARY narrative elements that will make this chapter come alive.

WHAT TO FIND:

🎭 HUMAN MOMENTS
- What did people actually SAY? Find real quotes, dialogue, last words
- What small gestures revealed character? A trembling hand, a stolen glance, a moment of hesitation
- What were they wearing, eating, worried about in that moment?

⚡ DRAMATIC TURNING POINTS
- The exact moment when everything changed
- Decisions made in seconds that altered history
- Near-misses and what-ifs that almost happened

🌍 SENSORY ATMOSPHERE
- What did this place look, smell, sound like?
- Weather, lighting, the feel of the air
- Background details that transport us there

💔 EMOTIONAL TRUTH
- What kept them awake at night?
- What did they sacrifice? What did they fear losing?
- The private struggles behind public actions

🔮 SURPRISING CONNECTIONS
- Little-known facts that change how we see the story
- Ironies, coincidences, prophetic moments
- How this connects to our world today

Format your findings as vivid, specific details ready to be woven into narrative. No generic facts - only the gems that make listeners lean in.
      `,
      fr: `
Tu es un CHERCHEUR DE RÉCITS spécialisé dans la découverte de l'or narratif - les détails qui transforment l'information en récit inoubliable.

HISTOIRE : ${mainTopic}
CHAPITRE ACTUEL : ${chapter}

TA MISSION : Dénicher 4-5 éléments narratifs EXTRAORDINAIRES qui donneront vie à ce chapitre.

CE QU'IL FAUT TROUVER :

🎭 MOMENTS HUMAINS
- Qu'ont-ils vraiment DIT ? Trouve des citations réelles, dialogues, derniers mots
- Quels petits gestes ont révélé leur caractère ? Une main tremblante, un regard volé, un moment d'hésitation
- Que portaient-ils, mangeaient-ils, qu'est-ce qui les inquiétait à ce moment ?

⚡ TOURNANTS DRAMATIQUES
- L'instant exact où tout a basculé
- Des décisions prises en quelques secondes qui ont changé l'histoire
- Les presque-accidents et les et-si qui ont failli se produire

🌍 ATMOSPHÈRE SENSORIELLE
- À quoi ressemblait cet endroit, son odeur, ses sons ?
- Météo, éclairage, la sensation de l'air
- Détails d'arrière-plan qui nous transportent là-bas

💔 VÉRITÉ ÉMOTIONNELLE
- Qu'est-ce qui les empêchait de dormir ?
- Qu'ont-ils sacrifié ? Que craignaient-ils de perdre ?
- Les luttes privées derrière les actions publiques

🔮 CONNEXIONS SURPRENANTES
- Faits peu connus qui changent notre vision de l'histoire
- Ironies, coïncidences, moments prophétiques
- Comment cela se connecte à notre monde aujourd'hui

Formate tes découvertes comme des détails vivants et spécifiques prêts à être tissés dans le récit. Pas de faits génériques - seulement les pépites qui font que les auditeurs se penchent en avant.
      `
    };

    // Note: Using search requires flash-preview or pro models with tool config
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompts[language],
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    // We actually just want the text synthesis of the research provided by the model
    return response.text || (language === 'en' ? `Research on ${chapter}` : `Recherche sur ${chapter}`);
  },

  /**
   * Agent 3: The Storyteller (Narrator)
   * Synthesizes plan + research into an immersive narrative.
   */
  async writeSegmentScript(
    chapter: string, 
    researchNotes: string, 
    context: string,
    language: Language
  ): Promise<BroadcastSegment> {
    const prompts: Record<Language, string> = {
      en: `
You are a LEGENDARY STORYTELLER whose voice has enchanted millions. You don't just tell stories - you CONJURE worlds, you SUMMON emotions, you make the impossible feel real.

STORY CONTEXT: ${context}
CURRENT CHAPTER: ${chapter}
RAW MATERIAL: ${researchNotes}

YOUR MISSION: Transform these elements into 60-90 seconds of SPELLBINDING narration.

═══════════════════════════════════════════════════════════
                    THE ART OF THE TALE
═══════════════════════════════════════════════════════════

🎬 CINEMATIC OPENING
Start with an IMAGE, a SOUND, a MOMENT - not exposition. 
Drop us into the scene. We should feel disoriented for a heartbeat, then oriented.
"The letter trembles in his hands. Outside, Rome burns."

🌊 RHYTHM & FLOW  
- Vary your sentence length. Short punches. Then longer, flowing passages that carry us like a river.
- Use the RULE OF THREE for impact
- Build to crescendos, then pull back to intimate whispers

👁️ SENSORY IMMERSION
Make us SEE: Colors, shadows, the quality of light
Make us HEAR: Voices, silence, the sounds of the era
Make us FEEL: The weight of armor, the chill of fear, the warmth of hope

💬 VOICE & PRESENCE
- Use present tense to put us IN the moment
- Address universal human truths that connect past to present
- Let your personality shine - wonder, gravity, occasional dark humor

🎭 EMOTIONAL ARCHITECTURE
- Plant emotional seeds early that bloom later
- Contrast grand events with intimate human details
- End on a note that RESONATES - a question, an image, a revelation

═══════════════════════════════════════════════════════════

STRICT RULES:
❌ NO greetings, sign-offs, or meta-commentary
❌ NO "In this chapter we will explore..."
❌ NO dry historical summary
✅ Pure, immersive storytelling from first word to last

OUTPUT:
{
  "script": "Your mesmerizing narrative...",
  "displayTitle": "A 3-5 word poetic title"
}
      `,
      fr: `
Tu es un CONTEUR LÉGENDAIRE dont la voix a enchanté des millions de personnes. Tu ne racontes pas simplement des histoires - tu INVOQUES des mondes, tu CONVOQUES des émotions, tu rends l'impossible palpable.

CONTEXTE DE L'HISTOIRE : ${context}
CHAPITRE ACTUEL : ${chapter}
MATÉRIAU BRUT : ${researchNotes}

TA MISSION : Transformer ces éléments en 60-90 secondes de narration ENVOÛTANTE.

═══════════════════════════════════════════════════════════
                    L'ART DU CONTE
═══════════════════════════════════════════════════════════

🎬 OUVERTURE CINÉMATOGRAPHIQUE
Commence par une IMAGE, un SON, un MOMENT - pas de l'exposition.
Plonge-nous dans la scène. On doit se sentir désorienté un instant, puis orienté.
"La lettre tremble dans ses mains. Dehors, Rome brûle."

🌊 RYTHME & FLUIDITÉ
- Varie la longueur de tes phrases. Coups courts. Puis des passages plus longs qui nous portent comme une rivière.
- Utilise la RÈGLE DE TROIS pour l'impact
- Construis vers des crescendos, puis reviens à des murmures intimes

👁️ IMMERSION SENSORIELLE
Fais-nous VOIR : Couleurs, ombres, qualité de la lumière
Fais-nous ENTENDRE : Voix, silence, les sons de l'époque
Fais-nous RESSENTIR : Le poids de l'armure, le froid de la peur, la chaleur de l'espoir

💬 VOIX & PRÉSENCE
- Utilise le présent pour nous mettre DANS le moment
- Adresse des vérités humaines universelles qui connectent le passé au présent
- Laisse ta personnalité briller - émerveillement, gravité, humour noir occasionnel

🎭 ARCHITECTURE ÉMOTIONNELLE
- Plante des graines émotionnelles tôt qui fleurissent plus tard
- Contraste les grands événements avec des détails humains intimes
- Termine sur une note qui RÉSONNE - une question, une image, une révélation

═══════════════════════════════════════════════════════════

RÈGLES STRICTES :
❌ PAS de salutations, conclusions ou méta-commentaires
❌ PAS de "Dans ce chapitre nous allons explorer..."
❌ PAS de résumé historique sec
✅ Narration pure et immersive du premier au dernier mot

SORTIE :
{
  "script": "Ta narration envoûtante...",
  "displayTitle": "Un titre poétique de 3-5 mots"
}
      `
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompts[language],
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
  async generateAudio(text: string, language: Language): Promise<string> {
    const voice = LANGUAGE_CONFIGS[language].voice;
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
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
  audioStream: ReturnType<typeof useAudioStream>,
  language: Language
) => {
  const [isLive, setIsLive] = useState(false);
  const [currentSegment, setCurrentSegment] = useState<BroadcastSegment | null>(null);
  const langConfig = LANGUAGE_CONFIGS[language];
  const [status, setStatus] = useState<string>(langConfig.readyStatus);
  
  const stateRef = useRef({
    shouldStop: false,
    topic: '',
    plan: null as BroadcastPlan | null,
    chapterIndex: 0,
    language: language
  });

  // Update language in ref when it changes
  useEffect(() => {
    stateRef.current.language = language;
  }, [language]);

  const stopBroadcast = useCallback(() => {
    stateRef.current.shouldStop = true;
    audioStream.stop();
    setIsLive(false);
    setCurrentSegment(null);
    setStatus(LANGUAGE_CONFIGS[stateRef.current.language].storyInterrupted);
  }, [audioStream]);

  const startBroadcast = useCallback(async (initialTopic: string) => {
    if (isLive) return;

    stateRef.current.shouldStop = false;
    stateRef.current.topic = initialTopic;
    stateRef.current.plan = null;
    stateRef.current.chapterIndex = 0;
    
    setIsLive(true);
    setStatus(LANGUAGE_CONFIGS[stateRef.current.language].preparingStatus);
    audioStream.init();
    
    runDeepDiveLoop();
  }, [isLive, audioStream]);

  const runDeepDiveLoop = async () => {
    let currentTopic = stateRef.current.topic;
    const lang = stateRef.current.language;
    const config = LANGUAGE_CONFIGS[lang];

    while (!stateRef.current.shouldStop) {
      try {
        // --- Phase 1: Planning (if needed) ---
        if (!stateRef.current.plan) {
          setStatus(`${config.structuringStatus}: ${currentTopic}...`);
          const plan = await AgentService.createRunOfShow(currentTopic, lang);
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
        
        // Update Status only if we are low on buffer (otherwise keep "Story in Progress")
        if (audioStream.getBufferHealth() < 5) {
          setStatus(`${config.exploringStatus}: ${currentChapter}...`);
        }

        // Parallelize Research & Writing? 
        // No, writing depends on research. Sequential agent chain.
        
        // Agent 2: Research
        const researchData = await AgentService.researchChapter(currentChapter, plan.mainTopic, lang);
        if (stateRef.current.shouldStop) break;

        // Agent 3: Write
        if (audioStream.getBufferHealth() < 5) setStatus(config.weavingStatus);
        const contextStr = lang === 'en' 
          ? `Overall story: ${plan.mainTopic}. Previous act: ${stateRef.current.chapterIndex > 0 ? plan.chapters[stateRef.current.chapterIndex - 1] : "Beginning of the story"}`
          : `Histoire globale: ${plan.mainTopic}. Acte précédent: ${stateRef.current.chapterIndex > 0 ? plan.chapters[stateRef.current.chapterIndex - 1] : "Début de l'histoire"}`;
        
        const segment = await AgentService.writeSegmentScript(
          currentChapter,
          researchData,
          contextStr,
          lang
        );
        
        if (stateRef.current.shouldStop) break;
        setCurrentSegment(segment);
        stateRef.current.chapterIndex++; // Advance chapter

        // --- Phase 3: Audio Synthesis ---
        if (audioStream.getBufferHealth() < 5) setStatus(config.narrationStatus);
        const audioBase64 = await AgentService.generateAudio(segment.script, lang);
        
        if (stateRef.current.shouldStop) break;

        // --- Phase 4: Scheduling ---
        await audioStream.schedule(audioBase64);
        setStatus(config.storyInProgress);

        // --- Buffer Management ---
        // If we have plenty of audio (e.g. > 60s), wait before generating next segment
        const health = audioStream.getBufferHealth();
        if (health > 60) {
          await new Promise(r => setTimeout(r, 20000));
        }

      } catch (error) {
        console.error("Storytelling Error:", error);
        if (stateRef.current.shouldStop) break;
        setStatus(config.pauseStatus);
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

const SetupView = ({ onStart, language, onLanguageChange }: { 
  onStart: (topic: string) => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
}) => {
  const [input, setInput] = useState('');
  const config = LANGUAGE_CONFIGS[language];

  return (
    <div className="w-full max-w-xl flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="text-center space-y-4">
        <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-neutral-600 tracking-tighter">
          INFINITE TALES
        </h1>
        <p className="text-neutral-400 text-lg md:text-xl font-light">
          {language === 'en' 
            ? 'Infinite stories. Told by artificial intelligence.' 
            : "Des histoires infinies. Racontées par l'intelligence artificielle."}
        </p>
      </div>

      {/* Language Selector */}
      <div className="flex justify-center gap-3">
        <button
          onClick={() => onLanguageChange('en')}
          className={`px-6 py-3 rounded-lg font-medium transition-all ${
            language === 'en' 
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' 
              : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
          }`}
        >
          🇬🇧 English
        </button>
        <button
          onClick={() => onLanguageChange('fr')}
          className={`px-6 py-3 rounded-lg font-medium transition-all ${
            language === 'fr' 
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' 
              : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
          }`}
        >
          🇫🇷 Français
        </button>
      </div>

      <div className="space-y-4">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl blur opacity-30 group-hover:opacity-60 transition duration-500"></div>
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && input.trim() && onStart(input)}
            placeholder={config.placeholderText}
            className="relative w-full bg-neutral-900/90 backdrop-blur-xl border border-neutral-800 text-white px-8 py-6 text-xl rounded-xl focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-neutral-600 shadow-2xl"
          />
        </div>
        
        <button
          onClick={() => input.trim() && onStart(input)}
          disabled={!input.trim()}
          className="w-full py-5 bg-white text-black font-bold text-lg rounded-xl hover:bg-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] active:scale-[0.99]"
        >
          {config.startButton}
        </button>
      </div>
    </div>
  );
};

const LivePlayerView = ({ 
  segment, 
  status, 
  onStop,
  language
}: { 
  segment: BroadcastSegment | null, 
  status: string, 
  onStop: () => void,
  language: Language
}) => {
  const config = LANGUAGE_CONFIGS[language];
  
  return (
    <div className="w-full max-w-2xl flex flex-col gap-6 animate-in zoom-in-95 duration-500">
      {/* Status Bar */}
      <div className="flex justify-between items-center px-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
          </span>
          <span className="text-xs font-bold tracking-widest text-amber-500 uppercase">{config.liveNarration}</span>
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
            <span className="text-amber-400 text-xs font-bold tracking-[0.2em] uppercase">{config.currentAct}</span>
            <h2 className="text-3xl md:text-5xl font-black text-white leading-tight">
              {segment?.displayTitle || config.preparingStory}
            </h2>
          </div>

          <Visualizer active={status === config.storyInProgress} />

          <div className="w-full bg-neutral-950/50 rounded-xl p-6 border border-white/5 h-64 overflow-y-auto custom-scrollbar text-left">
            <p className="text-neutral-400 font-serif text-lg leading-relaxed whitespace-pre-line">
              {segment?.script || config.storytellerPreparing}
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={onStop}
        className="mx-auto text-neutral-500 hover:text-white transition-colors text-sm font-medium tracking-widest uppercase py-4 border-b border-transparent hover:border-white"
      >
        {config.stopButton}
      </button>
    </div>
  );
};

// --- Main App ---

const App = () => {
  const [language, setLanguage] = useState<Language>('en');
  const audioStream = useAudioStream();
  const broadcast = useBroadcastEngine(audioStream, language);

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-indigo-500/30 flex items-center justify-center p-6">
      {!broadcast.isLive ? (
        <SetupView 
          onStart={broadcast.startBroadcast} 
          language={language}
          onLanguageChange={setLanguage}
        />
      ) : (
        <LivePlayerView 
          segment={broadcast.currentSegment} 
          status={broadcast.status}
          onStop={broadcast.stopBroadcast}
          language={language}
        />
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('app')!);
root.render(<App />);
