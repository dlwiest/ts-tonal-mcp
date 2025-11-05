import { MCPResponse } from '../types/index.js';

export class TonalMCPError extends Error {
  constructor(
    message: string,
    public code: string = 'UNKNOWN_ERROR',
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'TonalMCPError';
  }
}

export function handleToolError(error: unknown, toolName: string): MCPResponse {
  console.error(`Error in tool ${toolName}:`, error);

  let errorMessage: string;
  let errorCode: string = 'UNKNOWN_ERROR';

  if (error instanceof TonalMCPError) {
    errorMessage = error.message;
    errorCode = error.code;
  } else if (error instanceof Error) {
    errorMessage = error.message;
    
    // Categorize common errors
    if (error.message.includes('TONAL_USERNAME') || error.message.includes('TONAL_PASSWORD')) {
      errorCode = 'AUTHENTICATION_ERROR';
      errorMessage = 'Authentication failed. Please check your Tonal credentials are properly configured.';
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      errorCode = 'NETWORK_ERROR';
      errorMessage = 'Network error connecting to Tonal API. Please check your internet connection.';
    } else if (error.message.includes('unauthorized') || error.message.includes('401')) {
      errorCode = 'AUTHORIZATION_ERROR';
      errorMessage = 'Authorization failed. Your Tonal session may have expired.';
    }
  } else {
    errorMessage = String(error);
  }

  return {
    content: [
      {
        type: 'text',
        text: `❌ **Error in ${toolName}** (${errorCode})\n\n${errorMessage}`,
      },
    ],
  };
}