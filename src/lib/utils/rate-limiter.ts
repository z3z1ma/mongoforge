/**
 * Simple rate limiter to control the throughput of operations.
 */
export class RateLimiter {
  private targetOpsPerSec: number;
  private lastOpTime: number = 0;

  constructor(targetOpsPerSec: number) {
    this.targetOpsPerSec = targetOpsPerSec;
  }

  /**
   * Throttles the execution to maintain the target rate.
   */
  async throttle(): Promise<void> {
    if (this.targetOpsPerSec <= 0) return;

    const now = Date.now();
    const minInterval = 1000 / this.targetOpsPerSec;
    const elapsed = now - this.lastOpTime;

    if (elapsed < minInterval) {
      const delay = minInterval - elapsed;
      await new Promise(resolve => setTimeout(resolve, delay));
      this.lastOpTime = Date.now();
    } else {
      this.lastOpTime = now;
    }
  }
}
