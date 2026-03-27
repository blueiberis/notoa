export interface ApiResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

export interface LambdaEvent {
  httpMethod?: string;
  path?: string;
  headers?: Record<string, string>;
  body?: string;
  requestContext?: {
    authorizer?: {
      claims?: Record<string, any>;
    };
  };
}

export interface LambdaContext {
  awsRequestId: string;
  functionName: string;
  functionVersion: string;
  invokedFunctionArn: string;
  memoryLimitInMB: string;
  getRemainingTimeInMillis: () => number;
  done: (error?: any, result?: any) => void;
  fail: (error: any) => void;
  succeed: (messageOrObject: any) => void;
  callbackWaitsForEmptyEventLoop: boolean;
}

export type Handler = (event: LambdaEvent, context: LambdaContext, callback?: any) => Promise<ApiResponse>;

export class LambdaHandler {
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  // Centralized logging
  private log(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      service: this.serviceName,
      message,
      ...(data && { data })
    };
    console.log(JSON.stringify(logEntry));
  }

  // Centralized CORS headers
  private getCorsHeaders(): Record<string, string> {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Credentials': 'true',
    };
  }

  // Centralized error handling
  private handleError(error: Error, context?: string): ApiResponse {
    this.log('ERROR', { 
      error: error.message, 
      stack: error.stack,
      context 
    });

    return {
      statusCode: 500,
      headers: this.getCorsHeaders(),
      body: JSON.stringify({ 
        message: 'Internal server error',
        error: error.message 
      })
    };
  }

  // Centralized success response
  private successResponse(data: any, statusCode: number = 200): ApiResponse {
    this.log('SUCCESS', { statusCode });
    
    return {
      statusCode,
      headers: this.getCorsHeaders(),
      body: JSON.stringify(data)
    };
  }

  // Centralized error response (for client errors)
  private errorResponse(message: string, statusCode: number = 400): ApiResponse {
    this.log('CLIENT_ERROR', { message, statusCode });
    
    return {
      statusCode,
      headers: this.getCorsHeaders(),
      body: JSON.stringify({ message })
    };
  }

  // Get user claims from authorizer
  protected getUserClaims(event: LambdaEvent): Record<string, any> | null {
    return event.requestContext?.authorizer?.claims || null;
  }

  // Main handler wrapper
  public createHandler(
    handler: (event: LambdaEvent, context: LambdaContext, userClaims: Record<string, any> | null) => Promise<ApiResponse>
  ): Handler {
    return async (event: LambdaEvent, context: LambdaContext): Promise<ApiResponse> => {
      try {
        this.log('REQUEST_RECEIVED', { 
          httpMethod: event.httpMethod,
          path: event.path,
          requestId: context.awsRequestId
        });

        const userClaims = this.getUserClaims(event);
        
        if (userClaims) {
          this.log('USER_AUTHENTICATED', { 
            userId: userClaims.sub || userClaims['cognito:username'],
            username: userClaims['cognito:username']
          });
        }

        const result = await handler(event, context, userClaims);
        
        // Automatically add CORS headers to all responses
        if (!result.headers) {
          result.headers = this.getCorsHeaders();
        } else {
          // Merge with existing headers, ensuring CORS headers are present
          result.headers = { ...this.getCorsHeaders(), ...result.headers };
        }
        
        this.log('REQUEST_COMPLETED', { 
          statusCode: result.statusCode,
          requestId: context.awsRequestId
        });

        return result;

      } catch (error) {
        return this.handleError(error as Error, 'main_handler');
      }
    };
  }

  // Simplified helper methods - just return data, no headers needed
  protected success(data: any, statusCode: number = 200): ApiResponse {
    return {
      statusCode,
      body: JSON.stringify(data)
      // Headers will be added automatically by createHandler
    };
  }

  protected error(message: string, statusCode: number = 400): ApiResponse {
    return {
      statusCode,
      body: JSON.stringify({ message })
      // Headers will be added automatically by createHandler
    };
  }
}

// Helper function for quick handler creation
export function createHandler(serviceName: string) {
  const lambdaHandler = new LambdaHandler(serviceName);
  return lambdaHandler.createHandler.bind(lambdaHandler);
}
