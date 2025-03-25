import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  BaseMessage,
  HumanMessage, 
  AIMessage,
  SystemMessage
} from "@langchain/core/messages";
import { NetworkCall } from '@lurker-agent/core/dist/types';

// Import CSS
import './index.css';

// shadcn components - you'll need to install these
// Run these commands in your project directory:
// npm install tailwindcss postcss autoprefixer @radix-ui/react-switch @radix-ui/react-tooltip @radix-ui/react-label clsx tailwind-merge lucide-react class-variance-authority tailwindcss-animate
// npx tailwindcss init -p
// Then create a components folder and install the specific components

// Define Chrome message type for panel communications
interface ChromeMessage {
  type: string;
  enabled?: boolean;
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
  const [isRecording, setIsRecording] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Load saved messages on component mount
  useEffect(() => {
    // Load saved messages from chrome storage
    chrome.storage.local.get('messages', (result) => {
      if (result.messages) {
        // Convert stored messages back to LangChain message objects
        const savedMessages = result.messages.map((stored: StoredMessage) => {
          const { type, data } = stored;
          if (type === 'human') {
            return new HumanMessage(data.content);
          } else if (type === 'ai') {
            return new AIMessage(data.content);
          } else if (type === 'system') {
            return new SystemMessage(data.content);
          } else {
            return new AIMessage(data.content);
          }
        });
        setMessages(savedMessages);
      }
    });
    
    // Request network calls from background script
    loadNetworkCalls();
    
    // Check recording status on load
    chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' } as ChromeMessage, 
      (response) => {
        if (response && response.hasOwnProperty('enabled')) {
          setIsRecording(response.enabled);
        }
      }
    );

    // Load theme preference from localStorage - now handled by external script
    // But we still need to sync the React state with the current theme
    const savedTheme = localStorage.getItem('theme');
    const isDark = savedTheme === 'dark' || document.documentElement.classList.contains('dark');
    setIsDarkMode(isDark);
  }, []);

  // Save messages to chrome storage whenever they change
  useEffect(() => {
    // Convert messages to StoredMessage format for storage
    const messagesToStore = messages.map(msg => msg.toDict());
    chrome.storage.local.set({ messages: messagesToStore });
  }, [messages]);

  // Function to clear messages from storage
  const clearMessages = () => {
    setMessages([]);
    chrome.storage.local.remove('messages');
  };

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
      const completedCalls = latestNetworkCalls.filter(call => call.response !== null);
      const limitedCalls = completedCalls.slice(-100); // Limit to the most recent 100 network calls
      
      if (completedCalls.length > 100) {
        console.log(`Limiting network calls from ${completedCalls.length} to 100 most recent completed calls`);
      }
      
      const requestBody = {
        message: input,
        networkCalls: limitedCalls
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
      
      // Get the last message from the server (should be the AI response)
      // Filter out the duplicated user message(s) and keep only server response(s)
      const lastUserMessageContent = userMessage.content.toString();
      
      // Find all AI messages from the response
      const aiMessages = parsedMessages.filter(msg => 
        msg._getType() === 'ai' || msg._getType() === 'system'
      );
      
      // Update messages state by appending only the AI responses 
      // to the existing messages array
      if (aiMessages.length > 0) {
        setMessages(prev => [...prev, ...aiMessages]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  };

  // Function to toggle recording
  const toggleRecording = () => {
    const newRecordingState = !isRecording;
    setIsRecording(newRecordingState);
    chrome.runtime.sendMessage({ 
      type: 'TOGGLE_RECORDING', 
      enabled: newRecordingState 
    } as ChromeMessage);
  };

  // Function to clear network calls
  const clearNetworkCalls = () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_NETWORK_CALLS' } as ChromeMessage);
    setNetworkCalls([]);
  };

  // Function to toggle theme between dark and light
  const toggleTheme = () => {
    const newThemeState = !isDarkMode;
    setIsDarkMode(newThemeState);
    
    if (newThemeState) {
      // Switch to dark mode
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      // Switch to light mode
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  return (
    <div className="container mx-auto h-screen flex flex-col p-4 bg-background text-foreground">
      {/* Header with title and buttons */}
      <header className="flex justify-between items-center mb-4 border-b border-border pb-4">
        <h1 className="text-2xl font-bold text-primary">Lurker</h1>
        <div className="flex items-center space-x-4">
          {/* Theme Toggle */}
          <div className="flex items-center space-x-2">
            <div className="inline-flex items-center space-x-1">
              <span role="img" aria-label={isDarkMode ? "dark mode" : "light mode"}>
                {isDarkMode ? "🌙" : "☀️"}
              </span>
              <span className="text-muted-foreground">{isDarkMode ? "Dark" : "Light"}</span>
            </div>
            <button 
              className="relative inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input"
              role="switch"
              data-state={isDarkMode ? "checked" : "unchecked"}
              onClick={toggleTheme}
            >
              <span 
                className="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
                data-state={isDarkMode ? "checked" : "unchecked"}
              />
            </button>
          </div>

          {/* Recording Toggle */}
          <div className="flex items-center space-x-2">
            <div className="inline-flex items-center space-x-1">
              <span role="img" aria-label={isRecording ? "recording" : "paused"}>
                {isRecording ? "🔴" : "⏸️"}
              </span>
              <span className="text-muted-foreground">{isRecording ? "Recording" : "Paused"}</span>
            </div>
            <button 
              className="relative inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input"
              role="switch"
              data-state={isRecording ? "checked" : "unchecked"}
              onClick={toggleRecording}
            >
              <span 
                className="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
                data-state={isRecording ? "checked" : "unchecked"}
              />
            </button>
          </div>
          
          {/* Clear Data Button */}
          <button 
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-accent hover:bg-accent/80 hover:text-accent-foreground h-9 px-3 py-2 text-destructive"
            onClick={() => {
              clearNetworkCalls();
              clearMessages();
            }}
          >
            <span role="img" aria-label="clear" className="mr-1">🗑️</span>
            Clear Data
          </button>
        </div>
      </header>

      {/* Messages Container */}
      <div className="bg-card rounded-lg border border-border p-4 flex-1 overflow-auto mb-4">
        <div className="space-y-4">
          {messages.map((message, index) => {
            const type = message._getType();
            const isHuman = type === 'human';
            
            return (
              <div 
                key={index} 
                className={`flex flex-col ${isHuman ? 'items-end text-right' : 'items-start text-left'}`}
              >
                <span className={`${isHuman ? 'text-muted-foreground' : 'text-muted-foreground'} mb-1.5 px-1`}>
                  {isHuman ? 'You' : 'Assistant'}
                </span>
                <div className={`max-w-[80%] rounded-lg px-5 py-3 ${isHuman ? 'bg-secondary text-secondary-foreground' : 'bg-primary text-primary-foreground'}`}>
                  <p className="whitespace-pre-line">
                    {typeof message.content === 'string' 
                      ? message.content 
                      : JSON.stringify(message.content)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex-1">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about network calls..."
            disabled={loading}
            className="flex h-10 w-full rounded-md border border-input bg-card text-card-foreground px-3 py-2 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <button 
          type="submit" 
          disabled={loading}
          className="inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
        >
          Send
        </button>
      </form>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <Panel />
  </React.StrictMode>
); 