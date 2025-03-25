// Polyfill for crypto.getRandomValues() in Node.js
import crypto from 'crypto';
if (typeof global !== 'undefined' && global.crypto === undefined) {
  (global as any).crypto = {
    getRandomValues: function(buffer: Uint8Array) {
      return crypto.randomFillSync(buffer);
    }
  };
}

import express from 'express';
import cors from 'cors';
import { ChatOllama } from "@langchain/ollama";
import { StateGraph } from "@langchain/langgraph";
import { 
  SystemMessage, 
  HumanMessage, 
  AIMessage,
  BaseMessage
} from "@langchain/core/messages";
import { 
  NetworkCall 
} from '@lurker-agent/core/dist/types';
import { StringOutputParser } from "@langchain/core/output_parsers";

const app = express();
app.use(cors());
app.use(express.json());

// Initialize the LLM with JSON format
const llm = new ChatOllama({
  model: "llama3.2",
  temperature: 0.7,
  baseUrl: "http://127.0.0.1:11434", // using explicit IPv4 address instead of localhost
  verbose: true,
});

// Define the state type
type AgentState = {
  messages: BaseMessage[];
  networkCalls: NetworkCall[];
};

// Create the state graph
const workflow = new StateGraph<AgentState>({
  channels: {
    messages: {
      value: (old, new_val) => [...old, ...new_val],
      default: () => []
    },
    networkCalls: {
      value: (old, new_val) => [...old, ...new_val],
      default: () => []
    },
  },
});

// Add nodes to process messages and generate responses
workflow.addNode("process_message", async (state) => {
  const messages = state.messages;
  const networkCalls = state.networkCalls;
  
  // Process the last message and generate a response
  const lastMessage = messages[messages.length - 1];
  
  if (lastMessage._getType() === 'human') {
    // Format network calls data for the LLM
    const formattedNetworkCalls = formatNetworkCalls(networkCalls);
    
    // Create separate messages - one for instructions and one for data
    const instructionsContent = `
You are an AI assistant analyzing network calls. Use the provided network calls data to answer questions and provide insights.
Analyze the network calls to answer the user's questions. If asked about specific patterns, endpoints, or behaviors, refer directly to the data.
`;

    const networkDataContent = `
Here are the network calls that have been captured:
${formattedNetworkCalls}
`;

    // Replace any existing system message or add a new one
    let allMessages = messages.filter((m: BaseMessage) => m._getType() !== 'system');
    
    // Add the two system messages - instructions first, then data
    allMessages = [
      new SystemMessage(instructionsContent),
      new SystemMessage(networkDataContent),
      ...allMessages
    ];
    
    console.log('Sending messages to LLM:', allMessages.map((m: BaseMessage) => ({ type: m._getType(), content: typeof m.content === 'string' ? m.content.substring(0, 100) + '...' : '[Complex Content]' })));
    console.log('Network calls data:', networkCalls.length, 'calls');
    
    try {
      // Standard invocation with JSON format always enabled
      const response = await llm.invoke(allMessages);
      
      console.log('LLM response received:', response);
      
      return {
        messages: [...messages, response],
        networkCalls
      };
    } catch (error: any) {
      console.error('Error invoking LLM:', error);
      // Create a fallback AI message if the LLM invocation fails
      const errorMessage = new AIMessage(`I encountered an error analyzing the network calls: ${error.message}. Please try again.`);
      return {
        messages: [...messages, errorMessage],
        networkCalls
      };
    }
  }

  return { messages, networkCalls };
});

// Helper function to format network calls into a readable text representation
function formatNetworkCalls(networkCalls: NetworkCall[]): string {
  if (!networkCalls || networkCalls.length === 0) {
    return "No network calls captured yet.";
  }
  
  // Sort network calls by timestamp (most recent first)
  const sortedCalls = [...networkCalls].sort((a, b) => {
    const aTime = a.request?.timestamp || 0;
    const bTime = b.request?.timestamp || 0;
    return bTime - aTime;
  });
  
  // Format each call, limit to most recent 30 to avoid context length issues
  return sortedCalls.slice(0, 30).map((call, index) => {
    const request = call.request;
    const response = call.response;
    const timestamp = request?.timestamp ? new Date(request.timestamp).toISOString() : 'unknown time';
    const method = request?.method || 'UNKNOWN';
    const url = request?.url || 'unknown URL';
    const status = response?.status || 'pending';
    
    return `
CALL #${index + 1}:
- Time: ${timestamp}
- Request: ${method} ${url}
- Status: ${status}${response ? ` (${response.statusText || ''})` : ''}
`;
  }).join('');
}

// Set up entry and finish points
workflow.setEntryPoint('process_message');
workflow.setFinishPoint('process_message');

// Compile the workflow
const app_workflow = workflow.compile();

// API endpoints
app.post('/chat', async (req, res) => {
  console.log('Received request with body:', req.body);
  
  const { message, networkCalls } = req.body;
  
  // Validate we have the required data
  if (!message) {
    return res.status(400).json({ error: 'Missing message in request' });
  }
  
  try {
    const userMessage = new HumanMessage(message);
    
    console.log('Creating workflow input with:', {
      messageType: userMessage._getType(),
      messageContent: userMessage.content,
      networkCallsCount: networkCalls?.length || 0
    });
    
    const result = await app_workflow.invoke({
      messages: [userMessage],
      networkCalls: Array.isArray(networkCalls) ? networkCalls : []
    });
    
    console.log('Workflow execution completed');
    console.log('Response message count:', result.messages.length);
    console.log('Sending response:', result.messages.map((m: BaseMessage) => ({ 
      type: m._getType(), 
      contentPreview: typeof m.content === 'string' ? m.content.substring(0, 100) + '...' : '[Complex Content]' 
    })));
    
    // Convert messages to StoredMessage format using toDict() before sending to client
    const serializedMessages = result.messages.map((message: BaseMessage) => message.toDict());
    res.json(serializedMessages);
  } catch (error: any) {
    console.error('Error processing chat:', error);
    res.status(500).json({ error: 'Failed to process chat message', details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Agent service running on port ${PORT}`);
}); 