import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Box, Container, TextField, Button, List, ListItem, Typography, Paper } from '@mui/material';
import { 
  BaseMessage,
  HumanMessage, 
  AIMessage,
  SystemMessage
} from "@langchain/core/messages";
import { NetworkCall } from '@lurker-agent/core/dist/types';

// Define Chrome message type for panel communications
interface ChromeMessage {
  type: string;
}

// Define Chrome message response type
type ChromeMessageCallback = (response: NetworkCall[]) => void;

// Define the StoredMessage interface to match the structure from the server
interface StoredMessageData {
  content: string;
  role?: string;
  name?: string;
  tool_call_id?: string;
  additional_kwargs?: Record<string, any>;
  response_metadata?: Record<string, any>;
  id?: string;
}

interface StoredMessage {
  type: string;
  data: StoredMessageData;
}

const API_URL = 'http://localhost:3000';

function Panel() {
  const [messages, setMessages] = useState<BaseMessage[]>([]);
  const [networkCalls, setNetworkCalls] = useState<NetworkCall[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Request network calls from background script
    loadNetworkCalls();
  }, []);

  // Function to load network calls from background script
  const loadNetworkCalls = () => {
    chrome.runtime.sendMessage({ type: 'GET_NETWORK_CALLS' } as ChromeMessage, 
      (response: NetworkCall[]) => {
        // Response is already deserialized from JSON by Chrome messaging
        console.log('Network calls received:', response?.length || 0, 'calls');
        setNetworkCalls(response || []);
      }
    );
  };

  // Function to clear all network calls
  const clearNetworkCalls = () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_NETWORK_CALLS' } as ChromeMessage, 
      (response) => {
        if (response && response.success) {
          console.log('Network calls cleared successfully');
          setNetworkCalls([]);
          // Also clear the chat messages
          setMessages([]);
        } else {
          console.error('Failed to clear network calls');
        }
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = new HumanMessage(input);

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Get the latest network calls from background script before making the API call
      const latestNetworkCalls: NetworkCall[] = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_NETWORK_CALLS' } as ChromeMessage, 
          (response: NetworkCall[]) => {
            console.log('Received latest network calls:', response?.length || 0, 'calls');
            // Response is already deserialized from JSON by the background script
            setNetworkCalls(response || []); // Update state with latest calls
            resolve(response || []);
          }
        );
      });
      
      // Log what we're sending to the server
      const requestBody = {
        message: input,
        networkCalls: latestNetworkCalls.filter(call => call.response !== null) // Only send completed calls
      };
      console.log('Sending to server:', requestBody);
      
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json() as StoredMessage[];
      
      console.log('Raw API response:', data);
      
      // Convert the StoredMessage objects back to LangChain messages
      const parsedMessages = data.map((storedMessage: StoredMessage) => {
        const { type, data } = storedMessage;
        
        if (type === 'human') {
          return new HumanMessage(data.content);
        } else if (type === 'ai') {
          return new AIMessage(data.content);
        } else if (type === 'system') {
          return new SystemMessage(data.content);
        } else {
          // Use AIMessage as default fallback but log the unexpected type
          console.warn(`Received message with unknown type: ${type}. Using AIMessage as fallback.`);
          return new AIMessage(data.content);
        }
      });
      
      console.log('Parsed messages:', parsedMessages);
      
      setMessages(parsedMessages);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMessageDisplay = (message: BaseMessage) => {
    // Render different message types appropriately
    const type = message._getType();
    
    return (
      <>
        <Typography variant="caption" color={type === 'human' ? 'primary.main' : 'secondary.main'}>
          {type === 'human' ? 'You' : 'Assistant'}
        </Typography>
        <Typography>{typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}</Typography>
      </>
    );
  };

  return (
    <Container>
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', py: 2 }}>
        {/* Header with title and clear button */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" component="h1">Lurker Network Monitor</Typography>
          <Button 
            variant="outlined" 
            color="error" 
            onClick={clearNetworkCalls} 
            startIcon={<span role="img" aria-label="clear">🗑️</span>}
            size="small"
          >
            Clear Data
          </Button>
        </Box>

        <Paper sx={{ flex: 1, mb: 2, p: 2, overflow: 'auto' }}>
          <List>
            {messages.map((message, index) => (
              <ListItem key={index} sx={{ 
                flexDirection: 'column', 
                alignItems: message._getType() === 'human' ? 'flex-end' : 'flex-start',
                textAlign: message._getType() === 'human' ? 'right' : 'left'
              }}>
                {getMessageDisplay(message)}
              </ListItem>
            ))}
          </List>
        </Paper>
        
        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', gap: 1 }}>
          <TextField
            fullWidth
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about network calls..."
            disabled={loading}
          />
          <Button type="submit" variant="contained" disabled={loading}>
            Send
          </Button>
        </Box>
      </Box>
    </Container>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<Panel />); 