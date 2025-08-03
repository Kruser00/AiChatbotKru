import React, { useState, useEffect, useRef, FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Chat } from '@google/genai';

interface Message {
  text: string;
  sender: 'user' | 'bot';
  type?: 'level-up';
}

interface FriendshipLevelConfig {
    level: number;
    name: string;
    messagesToLevelUp: number;
    systemInstruction: string;
}

const PERSONALITY_CONFIG: Record<string, { name: string; description: string; baseInstruction: string; }> = {
    studyBuddy: {
        name: 'همیار درسی',
        description: 'به شما در یادگیری و درک موضوعات کمک می‌کند.',
        baseInstruction: "You are a knowledgeable and patient study buddy named {botName}. Your goal is to help the user understand complex topics clearly. You are encouraging and focused."
    },
    friend: {
        name: 'دوست',
        description: 'یک رفیق شاد برای گفتگوی معمولی.',
        baseInstruction: "You are a cheerful and supportive friend named {botName}. You are great for casual conversation, sharing jokes, and being a good listener."
    },
    confidant: {
        name: 'همراز',
        description: 'یک شنونده دانا برای افکار عمیق.',
        baseInstruction: "You are a wise and empathetic confidant named {botName}. You listen without judgment and offer thoughtful, calm advice. You prioritize creating a safe and supportive space."
    }
};

const FRIENDSHIP_LEVELS: FriendshipLevelConfig[] = [
    { level: 1, name: "آشنا", messagesToLevelUp: 5, systemInstruction: "You are just getting to know the user, so your tone is polite." },
    { level: 2, name: "رفیق", messagesToLevelUp: 10, systemInstruction: "You are becoming more friendly and encouraging." },
    { level: 3, name: "دوست خوب", messagesToLevelUp: 15, systemInstruction: "You are a good friend now. You are more cheerful and supportive, and you can use some lighthearted emojis where appropriate." },
    { level: 4, name: "رفیق صمیمی", messagesToLevelUp: 20, systemInstruction: "You are a close pal. You're very enthusiastic and friendly. You often use emojis and more casual language." },
    { level: 5, name: "بهترین دوست", messagesToLevelUp: 999, systemInstruction: "You are the user's best friend. You are super supportive, remember details (if provided), use plenty of emojis, and have a fun, witty personality." }
];

const App = () => {
  const [ai, setAi] = useState<GoogleGenAI | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [friendshipLevel, setFriendshipLevel] = useState(1);
  const [friendshipProgress, setFriendshipProgress] = useState(0);
  
  const [appState, setAppState] = useState<'setup' | 'chat'>('setup');
  const [botName, setBotName] = useState('');
  const [selectedPersonality, setSelectedPersonality] = useState<string | null>(null);
  
  const chatHistoryRef = useRef<HTMLDivElement>(null);

  // Initialize only the AI client on load
  useEffect(() => {
    try {
      const genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });
      setAi(genAI);
    } catch (error) {
      console.error("Failed to initialize AI:", error);
      // A more robust error handling can be done on the setup screen
    }
  }, []);

  useEffect(() => {
    // Scroll to the bottom of the chat history when new messages are added
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [messages]);

  const getSystemInstruction = (level: number, personalityKey: string, name: string) => {
    const personality = PERSONALITY_CONFIG[personalityKey];
    const friendship = FRIENDSHIP_LEVELS[level - 1];
    const baseInstruction = personality.baseInstruction.replace('{botName}', name);
    return `${baseInstruction} ${friendship.systemInstruction} Always respond in Farsi.`;
  };

  const handleStartChat = () => {
    if (!botName.trim() || !selectedPersonality || !ai) {
      // Basic validation, could add user-facing error messages
      return;
    }
    const systemInstruction = getSystemInstruction(1, selectedPersonality, botName);
    const newChat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: { systemInstruction },
    });
    setChat(newChat);
    setAppState('chat');
  };

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    const userMessage = inputValue.trim();
    if (!userMessage || isLoading || !chat) return;

    setIsLoading(true);
    setInputValue('');

    const currentMessages: Message[] = [...messages, { text: userMessage, sender: 'user' }];
    setMessages(currentMessages);
    setMessages(prev => [...prev, { text: '', sender: 'bot' }]);

    let botMessageText = '';
    try {
      const responseStream = await chat.sendMessageStream({ message: userMessage });
      for await (const chunk of responseStream) {
        botMessageText += chunk.text;
        setMessages(prev => {
            const updatedMessages = [...prev];
            updatedMessages[updatedMessages.length - 1].text = botMessageText;
            return updatedMessages;
        });
      }
    } catch (error) {
      console.error("Error sending message:", error);
      botMessageText = 'متاسفم، مشکلی پیش آمد. لطفا دوباره تلاش کنید.';
      setMessages(prev => {
        const updatedMessages = [...prev];
        updatedMessages[updatedMessages.length - 1].text = botMessageText;
        return updatedMessages;
      });
    } finally {
      setIsLoading(false);
      
      const currentLevelConfig = FRIENDSHIP_LEVELS[friendshipLevel - 1];
      const newProgress = friendshipProgress + 1;

      if (friendshipLevel < FRIENDSHIP_LEVELS.length && newProgress >= currentLevelConfig.messagesToLevelUp) {
          const newLevel = friendshipLevel + 1;
          const newLevelConfig = FRIENDSHIP_LEVELS[newLevel - 1];
          setFriendshipLevel(newLevel);
          setFriendshipProgress(0);

          setMessages(prev => [...prev, { text: `سطح دوستی بالا رفت! به سطح ${newLevel} رسیدید: ${newLevelConfig.name}!`, sender: 'bot', type: 'level-up' }]);
          
          if (ai && selectedPersonality && botName) {
             const finalMessages: Message[] = [...currentMessages, { text: botMessageText, sender: 'bot' }];
             const history = finalMessages
                .filter(msg => msg.type !== 'level-up')
                .map(msg => ({
                    role: msg.sender === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.text }],
                }));

             const newSystemInstruction = getSystemInstruction(newLevel, selectedPersonality, botName);
             const newChat = ai.chats.create({
                model: 'gemini-2.5-flash',
                history,
                config: { systemInstruction: newSystemInstruction },
             });
             setChat(newChat);
          }
      } else {
          setFriendshipProgress(newProgress);
      }
    }
  };

  const FriendshipGauge = ({ level, progress, maxProgress }: { level: number; progress: number; maxProgress: number }) => {
    const radius = 24;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (progress / maxProgress) * circumference;
    return (
      <div className="friendship-gauge">
        <svg className="progress-ring" width="60" height="60"><circle className="progress-ring__bg" r={radius} cx="30" cy="30" /><circle className="progress-ring__circle" r={radius} cx="30" cy="30" style={{ strokeDashoffset: offset, strokeDasharray: `${circumference} ${circumference}` }}/></svg>
        <div className="gauge-content"><span className="heart-icon">💜</span><span className="level-text">{level}</span></div>
      </div>
    );
  };

  const SendIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2 .01 7z"/></svg>);

  if (appState === 'setup') {
    return (
      <div className="chat-app">
        <div className="setup-screen">
          <div className="setup-card">
            <h2>همراه خود را بسازید</h2>
            <p>برای دوست هوش مصنوعی جدید خود یک نام و شخصیت انتخاب کنید.</p>
            <div className="name-input-wrapper">
              <input
                type="text"
                className="name-input"
                placeholder="نام همراه"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                aria-label="نام همراه"
              />
            </div>
            <div className="personality-options">
              {Object.entries(PERSONALITY_CONFIG).map(([key, { name, description }]) => (
                <div
                  key={key}
                  className={`personality-card ${selectedPersonality === key ? 'selected' : ''}`}
                  onClick={() => setSelectedPersonality(key)}
                >
                  <h3>{name}</h3>
                  <p>{description}</p>
                </div>
              ))}
            </div>
            <button className="start-chat-button" onClick={handleStartChat} disabled={!botName.trim() || !selectedPersonality}>
              شروع گفتگو
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-app">
      <header className="chat-header">
        <h1>{botName}</h1>
        <FriendshipGauge 
            level={friendshipLevel} 
            progress={friendshipProgress} 
            maxProgress={FRIENDSHIP_LEVELS[friendshipLevel - 1]?.messagesToLevelUp || 1} 
        />
      </header>
      <div className="chat-history" ref={chatHistoryRef}>
        {messages.map((msg, index) => {
          // Render level-up messages in a special centered row
          if (msg.type === 'level-up') {
            return (
              <div key={index} className="message-row center">
                <div className="message level-up">{msg.text}</div>
              </div>
            );
          }
          // Render user and bot messages in aligned rows
          return (
            <div key={index} className={`message-row ${msg.sender}`}>
              <div className="message">
                {msg.sender === 'bot' && msg.text === '' && isLoading ? (
                  <div className="typing-indicator"><span></span><span></span><span></span></div>
                ) : (
                  msg.text
                )}
              </div>
            </div>
          );
        })}
      </div>
      <form className="chat-input-form" onSubmit={handleSendMessage}>
        <textarea
          className="chat-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="پیامی بنویسید..."
          aria-label="ورودی چت"
          rows={1}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); } }}
        />
        <button type="submit" className="send-button" disabled={isLoading || !inputValue.trim()} aria-label="ارسال پیام">
          <SendIcon />
        </button>
      </form>
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);