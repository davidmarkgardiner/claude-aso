import { DefaultAzureCredential, WorkloadIdentityCredential } from '@azure/identity';
import { KubernetesApi } from '@kubernetes/client-node';
import { logger } from '../utils/logger';
import { config } from '../config/config';

export interface ManagedIdentityOptions {
  clientId?: string;
  tenantId?: string;
  federatedTokenFile?: string;
  clientAssertionPath?: string;
}

export class ManagedIdentityAuthService {
  private credential: DefaultAzureCredential | WorkloadIdentityCredential;
  private readonly options: ManagedIdentityOptions;

  constructor(options: ManagedIdentityOptions = {}) {
    this.options = options;
    this.initializeCredential();
  }

  private initializeCredential(): void {
    try {
      if (this.isRunningInKubernetes()) {
        // Running in Kubernetes with Workload Identity
        this.credential = new WorkloadIdentityCredential({
          tenantId: this.options.tenantId || process.env.AZURE_TENANT_ID,
          clientId: this.options.clientId || process.env.AZURE_CLIENT_ID,
          tokenFilePath: this.options.federatedTokenFile || process.env.AZURE_FEDERATED_TOKEN_FILE,
        });
        
        logger.info('Initialized Workload Identity credential', {
          clientId: this.maskClientId(this.options.clientId || process.env.AZURE_CLIENT_ID || 'unknown'),
          tenantId: this.options.tenantId || process.env.AZURE_TENANT_ID || 'unknown'
        });
      } else {
        // Fallback to DefaultAzureCredential (for local development)
        this.credential = new DefaultAzureCredential();
        
        logger.info('Initialized DefaultAzureCredential for local development');
      }
    } catch (error) {
      logger.error('Failed to initialize Azure credential', { error: error.message });
      throw new Error(`Failed to initialize Azure credential: ${error.message}`);
    }
  }

  /**
   * Get an access token for Azure Resource Manager
   */
  async getAccessToken(scope: string = 'https://management.azure.com/.default'): Promise<string> {
    try {
      const tokenResponse = await this.credential.getToken([scope]);
      
      if (!tokenResponse) {
        throw new Error('Failed to obtain access token');
      }

      logger.debug('Successfully obtained access token', {
        scope,
        expiresOn: tokenResponse.expiresOnTimestamp
      });

      return tokenResponse.token;
    } catch (error) {
      logger.error('Failed to get access token', { 
        scope,
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Failed to get access token: ${error.message}`);
    }
  }

  /**
   * Get an access token for Microsoft Graph API
   */
  async getGraphToken(): Promise<string> {
    return this.getAccessToken('https://graph.microsoft.com/.default');
  }

  /**
   * Validate that the managed identity can authenticate
   */
  async validateAuthentication(): Promise<boolean> {
    try {
      const token = await this.getAccessToken();
      return !!token;
    } catch (error) {
      logger.error('Managed identity authentication validation failed', { error: error.message });
      return false;
    }
  }

  /**
   * Get managed identity information
   */
  async getManagedIdentityInfo(): Promise<any> {
    try {
      if (this.isRunningInKubernetes()) {
        // In Kubernetes, identity info is available from environment or service account
        return {
          type: 'WorkloadIdentity',
          clientId: process.env.AZURE_CLIENT_ID,
          tenantId: process.env.AZURE_TENANT_ID,
          serviceAccount: process.env.SERVICE_ACCOUNT || 'platform-api',
          namespace: process.env.POD_NAMESPACE || 'platform-system'
        };
      } else {
        // For local development, return development info
        return {
          type: 'DefaultAzureCredential',
          environment: 'development'
        };
      }
    } catch (error) {
      logger.error('Failed to get managed identity info', { error: error.message });
      throw error;
    }
  }

  /**
   * Check if running inside Kubernetes pod
   */
  private isRunningInKubernetes(): boolean {
    return !!(
      process.env.KUBERNETES_SERVICE_HOST ||
      process.env.AZURE_CLIENT_ID ||
      config.nodeEnv === 'production'
    );
  }

  /**
   * Mask client ID for logging
   */
  private maskClientId(clientId: string): string {
    if (!clientId || clientId.length < 8) return 'unknown';
    return `${clientId.substring(0, 8)}***`;
  }
}

// Singleton instance
let managedIdentityAuthService: ManagedIdentityAuthService;

export const getManagedIdentityAuthService = (): ManagedIdentityAuthService => {
  if (!managedIdentityAuthService) {
    managedIdentityAuthService = new ManagedIdentityAuthService({
      clientId: process.env.AZURE_CLIENT_ID,
      tenantId: process.env.AZURE_TENANT_ID,
    });
  }
  return managedIdentityAuthService;
};

export { ManagedIdentityAuthService as default };