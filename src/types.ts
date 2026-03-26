export type Tier = 'low' | 'medium' | 'premium';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type: 'text' | 'image';
  url?: string;
  timestamp: number;
}

export interface GenerationState {
  isGenerating: boolean;
  progress: number;
  status: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  timestamp: number;
}
