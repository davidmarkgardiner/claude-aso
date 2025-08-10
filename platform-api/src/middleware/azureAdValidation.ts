import { Request, Response, NextFunction } from 'express';
import { DefaultAzureCredential } from '@azure/identity';
import axios from 'axios';
import { logger } from '../utils/logger';
import { AzureADPrincipal, RBACValidationResult } from '../types/rbac';
import { CircuitBreakerRegistry, CircuitBreakerError, CircuitState } from '../utils/circuitBreaker';

export class AzureADValidationService {
  private credential: DefaultAzureCredential;
  private graphApiBaseUrl = 'https://graph.microsoft.com/v1.0';
  private circuitBreaker = CircuitBreakerRegistry.getAzureADBreaker();

  constructor() {
    this.credential = new DefaultAzureCredential();
  }

  async validateUserPrincipal(userPrincipalName: string): Promise<RBACValidationResult> {
    try {
      // Use circuit breaker to protect against Azure AD API failures
      const result = await this.circuitBreaker.execute(async () => {
        const accessToken = await this.getGraphAccessToken();
        
        // Get user information from Microsoft Graph
        const response = await axios.get(
          `${this.graphApiBaseUrl}/users/${encodeURIComponent(userPrincipalName)}?$select=id,displayName,userPrincipalName`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            timeout: 5000 // 5 second timeout for individual requests
          }
        );

        return response.data;
      });

      const principal: AzureADPrincipal = {
        objectId: result.id,
        userPrincipalName: result.userPrincipalName,
        displayName: result.displayName,
        principalType: 'User',
        verified: true
      };

      return {
        valid: true,
        principal,
        principalType: 'User',
        errors: []
      };

    } catch (error: unknown) {
      if (error instanceof CircuitBreakerError) {
        logger.warn('Azure AD validation blocked by circuit breaker', { 
          userPrincipalName: this.maskPrincipalName(userPrincipalName),
          circuitState: error.circuitState,
          error: error.message
        });

        return {
          valid: false,
          principal: undefined,
          errors: [`Azure AD service temporarily unavailable: ${error.message}`]
        };
      }

      logger.error('Failed to validate user principal', { 
        userPrincipalName: this.maskPrincipalName(userPrincipalName), 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });

      if ((error as any)?.response?.status === 404) {
        return {
          valid: false,
          errors: [`User '${userPrincipalName}' not found in Azure AD`]
        };
      }

      return {
        valid: false,
        errors: [`Failed to validate user '${userPrincipalName}': ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  async validateGroupPrincipal(groupObjectId: string): Promise<RBACValidationResult> {
    try {
      const accessToken = await this.getGraphAccessToken();
      
      // Get group information from Microsoft Graph
      const response = await axios.get(
        `${this.graphApiBaseUrl}/groups/${groupObjectId}?$select=id,displayName`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const groupData = response.data;

      const principal: AzureADPrincipal = {
        objectId: groupData.id,
        displayName: groupData.displayName,
        principalType: 'Group',
        verified: true
      };

      return {
        valid: true,
        principal,
        errors: []
      };

    } catch (error: unknown) {
      logger.error('Failed to validate group principal', { 
        groupObjectId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });

      if ((error as any)?.response?.status === 404) {
        return {
          valid: false,
          errors: [`Group with ID '${groupObjectId}' not found in Azure AD`]
        };
      }

      return {
        valid: false,
        errors: [`Failed to validate group '${groupObjectId}': ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  async validatePrincipalById(objectId: string): Promise<RBACValidationResult> {
    try {
      const accessToken = await this.getGraphAccessToken();
      
      // Try to get the principal as either user or group
      try {
        const userResponse = await axios.get(
          `${this.graphApiBaseUrl}/users/${objectId}?$select=id,displayName,userPrincipalName`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const userData = userResponse.data;
        const principal: AzureADPrincipal = {
          objectId: userData.id,
          userPrincipalName: userData.userPrincipalName,
          displayName: userData.displayName,
          principalType: 'User',
          verified: true
        };

        return { valid: true, principal, errors: [] };

      } catch (userError) {
        // If not a user, try as a group
        const groupResponse = await axios.get(
          `${this.graphApiBaseUrl}/groups/${objectId}?$select=id,displayName`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const groupData = groupResponse.data;
        const principal: AzureADPrincipal = {
          objectId: groupData.id,
          displayName: groupData.displayName,
          principalType: 'Group',
          verified: true
        };

        return { valid: true, principal, errors: [] };
      }

    } catch (error: unknown) {
      logger.error('Failed to validate principal by ID', { 
        objectId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });

      return {
        valid: false,
        errors: [`Failed to validate principal '${objectId}': ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  private async getGraphAccessToken(): Promise<string> {
    try {
      const tokenResponse = await this.credential.getToken(['https://graph.microsoft.com/.default']);
      return tokenResponse.token;
    } catch (error: unknown) {
      logger.error('Failed to get Graph API access token', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw new Error('Failed to authenticate with Microsoft Graph API');
    }
  }

  private maskPrincipalName(principalName: string): string {
    if (principalName.includes('@')) {
      const [name, domain] = principalName.split('@');
      return `${name.substr(0, 2)}***@${domain}`;
    }
    return `${principalName.substr(0, 8)}***`;
  }
}

// Singleton instance
let azureAdValidationService: AzureADValidationService;

export const getAzureADValidationService = (): AzureADValidationService => {
  if (!azureAdValidationService) {
    azureAdValidationService = new AzureADValidationService();
  }
  return azureAdValidationService;
};

// Middleware to validate Azure AD principals in request body
export const validateAzureADPrincipal = (principalField: string = 'principalId') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const principalId = req.body[principalField];
    
    if (!principalId) {
      res.status(400).json({
        error: 'ValidationError',
        message: `${principalField} is required`,
        timestamp: new Date().toISOString()
      });
      return;
    }

    try {
      const validationService = getAzureADValidationService();
      const validationResult = await validationService.validatePrincipalById(principalId);

      if (!validationResult.valid) {
        res.status(400).json({
          error: 'ValidationError',
          message: 'Invalid Azure AD principal',
          details: validationResult.errors,
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Add validated principal to request for downstream use
      req.body.validatedPrincipal = validationResult.principal;
      next();

    } catch (error: unknown) {
      logger.error('Azure AD principal validation failed', { 
        principalId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      res.status(500).json({
        error: 'InternalError',
        message: 'Failed to validate Azure AD principal',
        timestamp: new Date().toISOString()
      });
    }
  };
};