import { BaseMessage } from "@langchain/core/messages";

// Extend the standard Request object with our metadata
export interface NetworkRequest extends Request {
  timestamp: number;
  requestId: string;
}

// Extend the standard Response object with our metadata
export interface NetworkResponse extends Response {
  requestId: string;
  timestamp: number;
}

// Use LangChain's BaseMessage for chat messages
export type ChatMessage = BaseMessage;

// Combined type for a network call (request + response)
export interface NetworkCall {
  request: NetworkRequest;
  response: NetworkResponse | null;
} 