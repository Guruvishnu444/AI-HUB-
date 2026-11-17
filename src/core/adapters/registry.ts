import { IProviderAdapter, ProviderConfig } from '../types/provider';
import { GeminiAdapter } from './gemini';
import { DeepSeekAdapter } from './deepseek';

export class AdapterRegistry {
    private adapters: Map<string, IProviderAdapter> = new Map();

    public registerAdapter(adapter: IProviderAdapter): void {
        this.adapters.set(adapter.providerId, adapter);
    }

    public getAdapter(providerId: string): IProviderAdapter | undefined {
        return this.adapters.get(providerId);
    }

    public getRegisteredProviderIds(): string[] {
        return Array.from(this.adapters.keys());
    }

    /**
     * Initializes default built-in adapters based on provider configs.
     */
    public initializeDefaultAdapters(configs: ProviderConfig[]): void {
        for (const config of configs) {
            if (config.id === 'google-gemini') {
                this.registerAdapter(new GeminiAdapter(config));
            } else if (config.id === 'deepseek') {
                this.registerAdapter(new DeepSeekAdapter(config));
            }
        }
    }
}
