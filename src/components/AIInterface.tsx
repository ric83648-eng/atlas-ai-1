import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Mic, 
  MicOff, 
  Sparkles, 
  Zap, 
  Crown,
  Loader2,
  Play,
  Download,
  User,
  Bot,
  Plus,
  MessageSquare,
  Trash2
} from 'lucide-react';
import Markdown from 'react-markdown';
import { Tier, Message, GenerationState, Conversation } from '../types';
import { generateImage, chatWithAI } from '../services/gemini';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TIER_LIMITS = {
  low: 10,
  medium: 50,
  premium: Infinity
};

export default function AIInterface() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [tier, setTier] = useState<Tier>('low');
  const [purchasedTiers, setPurchasedTiers] = useState<Tier[]>(['low']);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingTier, setPendingTier] = useState<Tier | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [usage, setUsage] = useState<Record<Tier, number>>(() => {
    const saved = localStorage.getItem('atlas_usage');
    return saved ? JSON.parse(saved) : { low: 0, medium: 0, premium: 0 };
  });
  const [genState, setGenState] = useState<GenerationState>({
    isGenerating: false,
    progress: 0,
    status: ''
  });

  useEffect(() => {
    localStorage.setItem('atlas_usage', JSON.stringify(usage));
  }, [usage]);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const activeConversation = conversations.find(c => c.id === activeId);
  const messages = activeConversation?.messages || [];

  useEffect(() => {
    // Initialize first conversation if none exists
    if (conversations.length === 0) {
      const newConv: Conversation = {
        id: Date.now().toString(),
        title: 'Nova Conversa',
        messages: [],
        timestamp: Date.now()
      };
      setConversations([newConv]);
      setActiveId(newConv.id);
    }
  }, []);

  const createNewConversation = () => {
    const newConv: Conversation = {
      id: Date.now().toString(),
      title: 'Nova Conversa',
      messages: [],
      timestamp: Date.now()
    };
    setConversations(prev => [newConv, ...prev]);
    setActiveId(newConv.id);
  };

  const deleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = conversations.filter(c => c.id !== id);
    setConversations(filtered);
    if (activeId === id) {
      setActiveId(filtered[0]?.id || null);
    }
  };

  const updateActiveMessages = (updater: (prev: Message[]) => Message[]) => {
    setConversations(prev => prev.map(c => {
      if (c.id === activeId) {
        const newMessages = updater(c.messages);
        // Update title if it's the first message
        let newTitle = c.title;
        if (newMessages.length > 0 && c.title === 'Nova Conversa') {
          newTitle = newMessages[0].content.slice(0, 20) + (newMessages[0].content.length > 20 ? '...' : '');
        }
        return { ...c, messages: newMessages, title: newTitle };
      }
      return c;
    }));
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'pt-BR';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const handleTierClick = (t: Tier) => {
    if (t === 'low' || purchasedTiers.includes(t)) {
      setTier(t);
    } else {
      setPendingTier(t);
      setShowPaymentModal(true);
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessingPayment(true);
    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (pendingTier) {
      setPurchasedTiers(prev => [...prev, pendingTier]);
      setTier(pendingTier);
    }
    setIsProcessingPayment(false);
    setShowPaymentModal(false);
    setPendingTier(null);
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || genState.isGenerating) return;

    // Check for intent
    const lowerInput = input.toLowerCase();
    const isImageRequest = lowerInput.includes('crie uma imagem') || lowerInput.includes('gerar imagem') || lowerInput.includes('image');

    // Check limits
    if (isImageRequest && usage[tier] >= TIER_LIMITS[tier]) {
      const limitMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Você atingiu o limite de criações do plano **${tier}** (${TIER_LIMITS[tier]}/${TIER_LIMITS[tier]}). Faça um upgrade para continuar criando!`,
        type: 'text',
        timestamp: Date.now()
      };
      updateActiveMessages(prev => [...prev, limitMsg]);
      return;
    }

    // Check for API key if it's a generation request for paid models
    if (isImageRequest && (tier === 'medium' || tier === 'premium')) {
      try {
        const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
        if (!hasKey) {
          await (window as any).aistudio?.openSelectKey();
          // After opening, we assume success and proceed as per guidelines
        }
      } catch (err) {
        console.warn("AI Studio API Key selection not available", err);
      }
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      type: 'text',
      timestamp: Date.now()
    };

    updateActiveMessages(prev => [...prev, userMsg]);
    const currentInput = input;
    setInput('');

    try {
      // Check for intent
      const lowerInput = currentInput.toLowerCase();
      const isImageRequest = lowerInput.includes('crie uma imagem') || lowerInput.includes('gerar imagem') || lowerInput.includes('image');

      if (isImageRequest) {
        setGenState({ isGenerating: true, progress: 10, status: 'Imaginando sua imagem...' });
        const url = await generateImage(currentInput, tier);
        
        // Increment usage
        setUsage(prev => ({ ...prev, [tier]: prev[tier] + 1 }));

        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Aqui está a imagem que você pediu!',
          type: 'image',
          url,
          timestamp: Date.now()
        };
        updateActiveMessages(prev => [...prev, aiMsg]);
      } else {
        const response = await chatWithAI(currentInput, messages);
        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response || 'Desculpe, não consegui processar sua solicitação.',
          type: 'text',
          timestamp: Date.now()
        };
        updateActiveMessages(prev => [...prev, aiMsg]);
      }
    } catch (error: any) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'Ocorreu um erro ao processar seu pedido. Verifique sua conexão ou tente novamente.';
      
      // If it's a permission error, try to open the key selector automatically
      if (errorMessage.includes('403') || errorMessage.includes('permission') || errorMessage.includes('Requested entity was not found')) {
        try {
          await (window as any).aistudio?.openSelectKey();
        } catch (keyErr) {
          console.warn("AI Studio API Key selection not available", keyErr);
        }
      }

      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: errorMessage,
        type: 'text',
        timestamp: Date.now()
      };
      updateActiveMessages(prev => [...prev, errorMsg]);
    } finally {
      setGenState({ isGenerating: false, progress: 0, status: '' });
    }
  };

  return (
    <div className="flex h-screen bg-brand-bg overflow-hidden">
      {/* Sidebar for Conversations */}
      <aside className="w-64 bg-brand-card border-r border-brand-border flex flex-col hidden md:flex">
        <div className="p-4">
          <button 
            onClick={createNewConversation}
            className="w-full flex items-center justify-center gap-2 py-3 bg-brand-primary/10 border border-brand-primary/20 rounded-xl text-brand-primary hover:bg-brand-primary/20 transition-all font-medium"
          >
            <Plus size={18} />
            Nova Conversa
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => setActiveId(conv.id)}
              className={cn(
                "w-full flex items-center justify-between p-3 rounded-xl text-sm transition-all group",
                activeId === conv.id 
                  ? "bg-brand-primary/10 text-brand-primary border border-brand-primary/20" 
                  : "text-white/60 hover:bg-white/5"
              )}
            >
              <div className="flex items-center gap-3 truncate">
                <MessageSquare size={16} className={activeId === conv.id ? "text-brand-primary" : "text-white/40"} />
                <span className="truncate">{conv.title}</span>
              </div>
              <Trash2 
                size={14} 
                className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all" 
                onClick={(e) => deleteConversation(conv.id, e)}
              />
            </button>
          ))}
        </div>
        
        <div className="p-4 border-t border-brand-border">
          <div className="flex items-center gap-3 p-2">
            <div className="w-8 h-8 rounded-lg bg-brand-primary/20 flex items-center justify-center">
              <User size={16} className="text-brand-primary" />
            </div>
            <div className="flex-1 truncate">
              <p className="text-xs font-medium truncate">Usuário Atlas</p>
              <p className="text-[10px] text-white/40 uppercase tracking-widest">Free Plan</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full relative">
        {/* Payment Modal */}
        <AnimatePresence>
          {showPaymentModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => !isProcessingPayment && setShowPaymentModal(false)}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="relative w-full max-w-md bg-brand-card border border-brand-border rounded-3xl p-8 shadow-2xl overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-brand-primary/20">
                  <motion.div 
                    className="h-full bg-brand-primary"
                    initial={{ width: 0 }}
                    animate={{ width: isProcessingPayment ? "100%" : "0%" }}
                    transition={{ duration: 2 }}
                  />
                </div>

                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-display font-bold mb-1 text-white">Assinar Plano {pendingTier?.toUpperCase()}</h2>
                    <p className="text-sm text-white/50">Desbloqueie o poder máximo do Atlas AI</p>
                  </div>
                  <div className="p-3 bg-brand-primary/10 rounded-2xl text-brand-primary">
                    {pendingTier === 'medium' ? <Sparkles size={24} /> : <Crown size={24} />}
                  </div>
                </div>

                <div className="bg-white/5 rounded-2xl p-4 mb-6 border border-white/5">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-white/60">Valor Mensal</span>
                    <span className="text-xl font-bold text-brand-primary">
                      {pendingTier === 'medium' ? 'R$ 49,00' : 'R$ 99,00'}
                    </span>
                  </div>
                  <div className="text-[10px] text-white/30 uppercase tracking-widest">Cobrança recorrente. Cancele quando quiser.</div>
                </div>

                <form onSubmit={handlePayment} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Número do Cartão</label>
                    <input 
                      required
                      type="text" 
                      placeholder="0000 0000 0000 0000"
                      className="w-full bg-black/40 border border-brand-border rounded-xl py-3 px-4 text-sm focus:border-brand-primary/50 outline-none transition-colors text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Validade</label>
                      <input 
                        required
                        type="text" 
                        placeholder="MM/AA"
                        className="w-full bg-black/40 border border-brand-border rounded-xl py-3 px-4 text-sm focus:border-brand-primary/50 outline-none transition-colors text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/40 font-mono">CVC</label>
                      <input 
                        required
                        type="text" 
                        placeholder="123"
                        className="w-full bg-black/40 border border-brand-border rounded-xl py-3 px-4 text-sm focus:border-brand-primary/50 outline-none transition-colors text-white"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isProcessingPayment}
                    className="w-full bg-brand-primary text-black font-bold py-4 rounded-2xl mt-4 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {isProcessingPayment ? (
                      <>
                        <Loader2 size={20} className="animate-spin" />
                        Processando...
                      </>
                    ) : (
                      <>Confirmar Pagamento</>
                    )}
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    disabled={isProcessingPayment}
                    className="w-full text-white/40 text-xs py-2 hover:text-white transition-colors"
                  >
                    Cancelar
                  </button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <div className="flex flex-col h-full max-w-5xl mx-auto w-full p-4 md:p-6">
          {/* Header */}
          <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-brand-primary rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.4)]">
                <Sparkles className="text-black w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl font-display font-bold tracking-tight text-white">Atlas AI</h1>
                <p className="text-xs text-white/50 uppercase tracking-widest font-mono">Creative Studio</p>
              </div>
            </div>

              <div className="flex bg-brand-card p-1 rounded-xl border border-brand-border">
                {(['low', 'medium', 'premium'] as Tier[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => handleTierClick(t)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-all flex flex-col items-center gap-1 min-w-[100px] relative overflow-hidden",
                      tier === t 
                        ? "bg-brand-primary text-black shadow-lg" 
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {t === 'low' && <Zap size={14} />}
                      {t === 'medium' && <Sparkles size={14} />}
                      {t === 'premium' && <Crown size={14} />}
                      <span className="capitalize">{t}</span>
                    </div>
                    {t === 'medium' && <span className={cn("text-[10px] font-bold", tier === t ? "text-black/70" : "text-brand-primary")}>R$ 49/mês</span>}
                    {t === 'premium' && <span className={cn("text-[10px] font-bold", tier === t ? "text-black/70" : "text-brand-primary")}>R$ 99/mês</span>}
                    {t === 'low' && <span className="text-[10px] opacity-50 italic">Grátis</span>}
                    
                    {/* Usage Indicator */}
                    {t !== 'premium' && (
                      <div className="mt-1 w-full h-0.5 bg-black/10 rounded-full overflow-hidden">
                        <div 
                          className={cn("h-full transition-all duration-500", tier === t ? "bg-black/40" : "bg-brand-primary")}
                          style={{ width: `${Math.min((usage[t] / TIER_LIMITS[t]) * 100, 100)}%` }}
                        />
                      </div>
                    )}

                    {t !== 'low' && !purchasedTiers.includes(t) && (
                      <div className="absolute top-1 right-1">
                        <div className="w-2 h-2 bg-brand-primary rounded-full animate-pulse shadow-[0_0_5px_rgba(139,92,246,0.5)]" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
          </header>

          {/* Chat Area */}
          <div className="flex-1 overflow-y-auto mb-6 space-y-6 pr-2 custom-scrollbar">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-60">
                <div className="w-20 h-20 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
                  <Bot size={40} className="text-white" />
                </div>
                <div className="max-w-md">
                  <h2 className="text-xl font-display font-semibold mb-2 text-white">Como posso ajudar hoje?</h2>
                  <p className="text-sm text-white/60">
                    Tente dizer: "Crie uma imagem de uma cidade futurista neon".
                  </p>
                </div>
              </div>
            )}
            
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex gap-4",
                    msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    msg.role === 'user' ? "bg-white/10" : "bg-brand-primary/20 border border-brand-primary/30"
                  )}>
                    {msg.role === 'user' ? <User size={20} className="text-white" /> : <Bot size={20} className="text-brand-primary" />}
                  </div>
                  
                  <div className={cn(
                    "max-w-[85%] space-y-2",
                    msg.role === 'user' ? "items-end" : "items-start"
                  )}>
                    <div className={cn(
                      "p-4 rounded-2xl text-sm leading-relaxed",
                      msg.role === 'user' 
                        ? "bg-white/5 border border-white/10 rounded-tr-none text-white" 
                        : "bg-brand-card border border-brand-border rounded-tl-none text-white"
                    )}>
                      <div className="prose prose-invert prose-sm max-w-none">
                        <Markdown>
                          {msg.content}
                        </Markdown>
                      </div>
                    </div>

                    {msg.type === 'image' && msg.url && (
                      <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="relative group rounded-2xl overflow-hidden border border-brand-border shadow-2xl"
                      >
                        <img src={msg.url} alt="Generated" className="w-full h-auto" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                          <button className="p-3 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-md text-white">
                            <Download size={20} />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {genState.isGenerating && (
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-brand-primary/20 border border-brand-primary/30 flex items-center justify-center shrink-0">
                  <Loader2 size={20} className="text-brand-primary animate-spin" />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="p-4 bg-brand-card border border-brand-border rounded-2xl rounded-tl-none">
                    <p className="text-sm font-medium text-brand-primary animate-pulse">{genState.status}</p>
                  </div>
                  <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-brand-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${genState.progress}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Area */}
          <div className="relative">
            {messages.some(m => m.content.includes('403')) && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4"
              >
                <div className="text-xs text-red-400">
                  <p className="font-bold mb-1">Problema de Permissão Detectado</p>
                  <p>Certifique-se de usar uma chave de um projeto com faturamento ativado.</p>
                  <a 
                    href="https://ai.google.dev/gemini-api/docs/billing" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="underline hover:text-red-300 transition-colors"
                  >
                    Ver documentação de faturamento
                  </a>
                </div>
                <button
                  onClick={() => (window as any).aistudio?.openSelectKey()}
                  className="px-4 py-2 bg-red-500 text-white text-xs font-bold rounded-xl hover:bg-red-600 transition-colors shrink-0"
                >
                  Selecionar Nova Chave
                </button>
              </motion.div>
            )}
            <form onSubmit={handleSend} className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Descreva o que você quer criar..."
                  className="w-full bg-brand-card border border-brand-border rounded-2xl py-4 px-4 text-sm focus:outline-none focus:border-brand-primary/50 transition-colors text-white"
                  disabled={genState.isGenerating}
                />
              </div>

              <button
                type="button"
                onClick={toggleListening}
                className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
                  isListening 
                    ? "bg-red-500 text-white animate-pulse" 
                    : "bg-white/5 text-white/60 hover:bg-white/10"
                )}
              >
                {isListening ? <MicOff size={20} /> : <Mic size={20} />}
              </button>

              <button
                type="submit"
                disabled={!input.trim() || genState.isGenerating}
                className="w-12 h-12 bg-brand-primary text-black rounded-2xl flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-all shadow-[0_0_15px_rgba(139,92,246,0.2)]"
              >
                <Send size={20} />
              </button>
            </form>
            
            <div className="mt-3 flex justify-center gap-6 text-[10px] text-white/30 uppercase tracking-widest font-mono">
              <div className="flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-brand-primary" />
                <span>Voice Enabled</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-brand-primary" />
                <span>{tier === 'premium' ? 'Unlimited' : `${usage[tier]}/${TIER_LIMITS[tier]}`} Creations</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-brand-primary" />
                <span>{tier} Mode Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
