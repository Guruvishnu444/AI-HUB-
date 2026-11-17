import { ProviderCapabilities } from './provider';

export interface ModelMetadata {
    id: string;                      // Wire model identifier (e.g. "gemini-2.5-flash", "deepseek-chat")
    displayName: string;             // Human readable name (e.g. "Gemini 2.5 Flash", "DeepSeek V3")
    providerId: string;              // Owning provider ID (e.g. "google-gemini", "deepseek")
    capabilities: ProviderCapabilities;
    isCustom: boolean;               // User manually added custom model
    isEnabled: boolean;
    defaultTemperature?: number;
    defaultTopP?: number;
    description?: string;
}
