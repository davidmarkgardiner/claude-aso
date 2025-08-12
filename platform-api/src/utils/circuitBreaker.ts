import { logger } from "./logger";

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number; // milliseconds
  monitoringPeriod: number; // milliseconds
  timeout: number; // request timeout in milliseconds
  name: string;
}

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public circuitState: CircuitState,
  ) {
    super(message);
    this.name = "CircuitBreakerError";
  }
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private nextAttempt: number = Date.now();
  private successCount: number = 0;
  private requestCount: number = 0;
  private lastFailureTime: number = 0;

  constructor(private options: CircuitBreakerOptions) {
    logger.info("Circuit breaker initialized", {
      name: options.name,
      failureThreshold: options.failureThreshold,
      resetTimeout: options.resetTimeout,
      timeout: options.timeout,
    });
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      (async () => {
        if (this.state === CircuitState.OPEN) {
          if (Date.now() < this.nextAttempt) {
            const waitTime = Math.ceil((this.nextAttempt - Date.now()) / 1000);
            logger.warn("Circuit breaker is OPEN", {
              name: this.options.name,
              waitTime,
              failures: this.failures,
              lastFailure: new Date(this.lastFailureTime).toISOString(),
            });

            return reject(
              new CircuitBreakerError(
                `Circuit breaker is OPEN. Try again in ${waitTime} seconds.`,
                CircuitState.OPEN,
              ),
            );
          } else {
            this.state = CircuitState.HALF_OPEN;
            this.successCount = 0;
            logger.info("Circuit breaker moving to HALF_OPEN", {
              name: this.options.name,
            });
          }
        }

        this.requestCount++;

        // Set timeout for the request
        const timeoutId = setTimeout(() => {
          this.onFailure(
            new Error(`Request timeout after ${this.options.timeout}ms`),
          );
          reject(
            new CircuitBreakerError(
              `Request timeout after ${this.options.timeout}ms`,
              this.state,
            ),
          );
        }, this.options.timeout);

        try {
          const result = await fn();
          clearTimeout(timeoutId);
          this.onSuccess();
          resolve(result);
        } catch (error) {
          clearTimeout(timeoutId);
          this.onFailure(error as Error);
          reject(error);
        }
      })();
    });
  }

  private onSuccess(): void {
    this.failures = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      // If we have enough successful calls in HALF_OPEN state, close the circuit
      if (this.successCount >= Math.ceil(this.options.failureThreshold / 2)) {
        this.state = CircuitState.CLOSED;
        logger.info("Circuit breaker reset to CLOSED", {
          name: this.options.name,
          successCount: this.successCount,
        });
      }
    }

    // Log success metrics periodically
    if (this.requestCount % 50 === 0) {
      logger.debug("Circuit breaker health check", {
        name: this.options.name,
        state: this.state,
        requestCount: this.requestCount,
        failures: this.failures,
        successRate:
          (
            ((this.requestCount - this.failures) / this.requestCount) *
            100
          ).toFixed(2) + "%",
      });
    }
  }

  private onFailure(error: Error): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    logger.warn("Circuit breaker recorded failure", {
      name: this.options.name,
      failures: this.failures,
      threshold: this.options.failureThreshold,
      error: error.message,
      state: this.state,
    });

    if (this.state === CircuitState.HALF_OPEN) {
      // If we fail in HALF_OPEN state, immediately go back to OPEN
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.options.resetTimeout;

      logger.error("Circuit breaker failed in HALF_OPEN, returning to OPEN", {
        name: this.options.name,
        nextAttempt: new Date(this.nextAttempt).toISOString(),
      });
    } else if (this.failures >= this.options.failureThreshold) {
      // Open the circuit
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.options.resetTimeout;

      logger.error("Circuit breaker threshold exceeded, opening circuit", {
        name: this.options.name,
        failures: this.failures,
        threshold: this.options.failureThreshold,
        nextAttempt: new Date(this.nextAttempt).toISOString(),
        resetTimeoutMinutes: Math.ceil(this.options.resetTimeout / 60000),
      });
    }
  }

  // Get current metrics for monitoring
  getMetrics() {
    const now = Date.now();
    return {
      name: this.options.name,
      state: this.state,
      failures: this.failures,
      requestCount: this.requestCount,
      successRate:
        this.requestCount > 0
          ? (
              ((this.requestCount - this.failures) / this.requestCount) *
              100
            ).toFixed(2) + "%"
          : "N/A",
      isHealthy: this.state === CircuitState.CLOSED,
      nextAttemptIn:
        this.state === CircuitState.OPEN
          ? Math.max(0, Math.ceil((this.nextAttempt - now) / 1000))
          : 0,
      lastFailure:
        this.lastFailureTime > 0
          ? new Date(this.lastFailureTime).toISOString()
          : null,
    };
  }

  // Reset circuit breaker manually (for maintenance)
  reset(): void {
    logger.info("Circuit breaker manually reset", { name: this.options.name });
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.requestCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.nextAttempt = Date.now();
  }

  // Force circuit open (for maintenance mode)
  forceOpen(): void {
    logger.warn("Circuit breaker forced open", { name: this.options.name });
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  }
}

// Pre-configured circuit breakers for common services
export class CircuitBreakerRegistry {
  private static breakers: Map<string, CircuitBreaker> = new Map();

  static getAzureADBreaker(): CircuitBreaker {
    const name = "azure-ad-api";
    if (!this.breakers.has(name)) {
      this.breakers.set(
        name,
        new CircuitBreaker({
          name,
          failureThreshold: 5, // Open after 5 failures
          resetTimeout: 30000, // Try again after 30 seconds
          monitoringPeriod: 60000, // 1 minute monitoring window
          timeout: 5000, // 5 second request timeout
        }),
      );
    }
    return this.breakers.get(name)!;
  }

  static getKubernetesBreaker(): CircuitBreaker {
    const name = "kubernetes-api";
    if (!this.breakers.has(name)) {
      this.breakers.set(
        name,
        new CircuitBreaker({
          name,
          failureThreshold: 10, // More tolerant for K8s API
          resetTimeout: 15000, // Shorter reset for faster recovery
          monitoringPeriod: 30000, // 30 second monitoring window
          timeout: 10000, // 10 second timeout for K8s operations
        }),
      );
    }
    return this.breakers.get(name)!;
  }

  static getASOBreaker(): CircuitBreaker {
    const name = "azure-service-operator";
    if (!this.breakers.has(name)) {
      this.breakers.set(
        name,
        new CircuitBreaker({
          name,
          failureThreshold: 3, // ASO failures are more serious
          resetTimeout: 60000, // 1 minute reset time
          monitoringPeriod: 120000, // 2 minute monitoring window
          timeout: 30000, // 30 second timeout for ASO operations
        }),
      );
    }
    return this.breakers.get(name)!;
  }

  // Get health status of all circuit breakers
  static getHealthStatus() {
    const status: { [key: string]: any } = {};

    for (const [name, breaker] of this.breakers.entries()) {
      status[name] = breaker.getMetrics();
    }

    return {
      timestamp: new Date().toISOString(),
      circuitBreakers: status,
      overallHealthy: Object.values(status).every((cb: any) => cb.isHealthy),
    };
  }

  // Reset all circuit breakers (for emergency recovery)
  static resetAll(): void {
    logger.warn("Resetting all circuit breakers");
    for (const [, breaker] of this.breakers.entries()) {
      breaker.reset();
    }
  }
}

export default CircuitBreaker;
