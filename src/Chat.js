import React, { useRef, useEffect, useState } from 'react';
import './Chat.css';

function Chat() {
    const [isSending, setIsSending] = useState(false);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [ongoingMessage, setOngoingMessage] = useState('');
    const ongoingMessageRef = useRef('');

    let messageTimeout;

    useEffect(() => {
        const eventSource = new EventSource('http://localhost:3001/api/stream-response');
        eventSource.onmessage = event => {

            const { message } = JSON.parse(event.data);
            ongoingMessageRef.current += message;

            clearTimeout(messageTimeout);
            messageTimeout = setTimeout(() => finalizeMessage(), 5000);

            setOngoingMessage(prev => prev + message);

            setMessages(msgs => {
                const newMsgs = [...msgs];

                let lastMsgIndex = newMsgs.length - 1;

                if (lastMsgIndex >= 0 && newMsgs[lastMsgIndex].chatid === "ongoing") {
                    newMsgs[lastMsgIndex].text = ongoingMessageRef.current;

                } else {
                    newMsgs.push({
                        text: message,
                        chatid: "ongoing",
                        sender: "Bot:",
                        timestamp: new Date().toISOString()
                    });

                }

                return newMsgs;
            });
        };

        return () => {
            console.log('Closing SSE connection');
            eventSource.close();
        };
    }, []);

    const finalizeMessage = () => {
        console.log('Finalizing message:', ongoingMessageRef.current);
        setMessages(msgs => {
            if (msgs.length > 0 && msgs[msgs.length - 1].chatid === "ongoing") {
                const newMsgs = [...msgs];
                newMsgs[newMsgs.length - 1].chatid = "bot";
                return newMsgs;
            }
            return msgs;
        });
        setOngoingMessage(''); // Clear the ongoing message
        ongoingMessageRef.current = ''
    };



    // Function to send a new message
    async function sendMessage(message) {
        try {
            const response = await fetch('http://localhost:3001/api/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message }),
            });

            if (!response.ok) {
                throw new Error('Failed to send message');
            }

            setMessages(msgs => [...msgs, {
                text: message,
                chatid: "user",
                sender: "You:",
                timestamp: new Date().toISOString()
            }]);
        } catch (error) {
            console.error('Error sending message:', error);
        } finally {
            setNewMessage('');
        }
    }

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;
        await sendMessage(newMessage);
        setIsSending(true);
    };

    return (
        <div>
            <div className="chat-container">
                <pre style={{ whiteSpace: 'pre-wrap' }}>

                    <ul>
                        {messages.map((msg, index) => (
                            <li className={msg.chatid} key={index}>
                                <strong>{msg.sender}<br /><em>{msg.timestamp}</em></strong><br /><br /> {msg.text}
                            </li>
                        ))}
                    </ul>
                </pre>
            </div>
            <div className="chat-input">
                <form onSubmit={handleSendMessage}>
                    <input
                        type="text"
                        autoFocus
                        value={newMessage}
                        // disabled={isSending}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type your message here..."
                    />

                    <button type="submit" >Send</button>
                </form>
            </div>
        </div>

    );
}

export default Chat;