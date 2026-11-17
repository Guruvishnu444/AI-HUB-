export class CircuitBreaker {
    private failureCounts: Map<string, number> = new Map();
    private openUntil: Map<string, number> = new Map();
    private consecutiveFailureThreshold: number;
    private cooldownMs: number;

    constructor(threshold = 3, cooldownMs = 60000) {
        this.consecutiveFailureThreshold = threshold;
        this.cooldownMs = cooldownMs;
    }

    public updateConfig(threshold: number, cooldownMs: number): void {
        this.consecutiveFailureThreshold = threshold;
        this.cooldownMs = cooldownMs;
    }

    public isOpen(providerId: string): boolean {
        const until = this.openUntil.get(providerId);
        if (!until) return false;

        if (Date.now() < until) {
            return true; // Still open
        }

        // Cool-down elapsed: transition to HALF_OPEN (allow next request to probe)
        this.openUntil.delete(providerId);
        return false;
    }

    public recordSuccess(providerId: string): void {
        this.failureCounts.set(providerId, 0);
        this.openUntil.delete(providerId);
    }

    public recordFailure(providerId: string): { tripped: boolean; cooldownSeconds: number } {
        const count = (this.failureCounts.get(providerId) || 0) + 1;
        this.failureCounts.set(providerId, count);

        if (count >= this.consecutiveFailureThreshold) {
            const until = Date.now() + this.cooldownMs;
            this.openUntil.set(providerId, until);
            return {
                tripped: true,
                cooldownSeconds: Math.ceil(this.cooldownMs / 1000)
            };
        }

        return { tripped: false, cooldownSeconds: 0 };
    }

    public reset(providerId: string): void {
        this.failureCounts.delete(providerId);
        this.openUntil.delete(providerId);
    }
}
