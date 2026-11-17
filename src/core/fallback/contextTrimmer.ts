import { ChatCompletionRequest } from '../types/chat';
import { ModelMetadata } from '../types/model';

export class ContextTrimmer {
    /**
     * Estimates token count using standard 4 characters per token heuristic.
     */
    public static estimateTokens(text: string): number {
        if (!text) return 0;
        return Math.ceil(text.length / 4);
    }

    /**
     * Ensures message history does not exceed the target model's maxContextTokens limit.
     * Always preserves the system prompt (if present) and the most recent user turn.
     */
    public static trimForModel(
        request: ChatCompletionRequest,
        targetModel: ModelMetadata
    ): { trimmedRequest: ChatCompletionRequest; wasTrimmed: boolean } {
        const maxTokensAllowed = Math.floor(targetModel.capabilities.maxContextTokens * 0.85); // 15% safety buffer for generation
        
        let totalEstimatedTokens = 0;
        for (const msg of request.messages) {
            totalEstimatedTokens += this.estimateTokens(msg.content);
        }

        if (totalEstimatedTokens <= maxTokensAllowed) {
            return { trimmedRequest: request, wasTrimmed: false };
        }

        // Must trim: preserve system prompt at index 0, and retain newest messages from the end
        const systemMessages = request.messages.filter(m => m.role === 'system');
        const nonSystemMessages = request.messages.filter(m => m.role !== 'system');

        let budgetRemaining = maxTokensAllowed;
        for (const sys of systemMessages) {
            budgetRemaining -= this.estimateTokens(sys.content);
        }

        const keptNonSystem: typeof nonSystemMessages = [];
        // Walk backwards from newest to oldest
        for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
            const msg = nonSystemMessages[i];
            const tokens = this.estimateTokens(msg.content);
            if (budgetRemaining - tokens > 0 || keptNonSystem.length === 0) {
                keptNonSystem.unshift(msg);
                budgetRemaining -= tokens;
            } else {
                break;
            }
        }

        const trimmedMessages = [...systemMessages, ...keptNonSystem];

        return {
            trimmedRequest: {
                ...request,
                messages: trimmedMessages
            },
            wasTrimmed: true
        };
    }
}
