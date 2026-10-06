export interface AIResponse {
  content: string;
  provider: 'gemini-free' | 'groq-free' | 'ollama-local';
  model: string;
  tokensEstimated?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIProvider {
  readonly name: 'gemini-free' | 'groq-free' | 'ollama-local';
  isAvailable(): Promise<boolean>;
  generateReply(systemPrompt: string, history: ChatMessage[]): Promise<AIResponse>;
}
