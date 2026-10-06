import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AIProvider, AIResponse, ChatMessage } from '../ai.interface';

@Injectable()
export class GroqProvider implements AIProvider {
  readonly name = 'groq-free' as const;
  private readonly logger = new Logger(GroqProvider.name);
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.GROQ_API_KEY || '';
    this.model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async generateReply(systemPrompt: string, history: ChatMessage[]): Promise<AIResponse> {
    if (!this.apiKey) {
      throw new Error('GROQ_API_KEY no configurada.');
    }

    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history
    ];

    this.logger.debug(`Llamando a Groq Free (${this.model})...`);

    const res = await axios.post(
      endpoint,
      {
        model: this.model,
        messages,
        temperature: 0.3,
        max_tokens: 380
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    const reply = res.data?.choices?.[0]?.message?.content?.trim() || '';
    return {
      content: reply,
      provider: 'groq-free',
      model: this.model,
      tokensEstimated: res.data?.usage?.total_tokens
    };
  }
}
