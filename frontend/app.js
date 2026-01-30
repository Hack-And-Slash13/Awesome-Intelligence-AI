// ============================================
// CONFIGURATION
// ============================================

const API_BASE_URL = ''; // same-origin API

// ============================================
// STATE MANAGEMENT
// ============================================

let conversationId = null;
let isWaitingForResponse = false;
let voiceMode = false;

// ============================================
// DOM ELEMENTS
// ============================================

const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const imageButton = document.getElementById('imageButton');
const typingIndicator = document.getElementById('typingIndicator');
const clearChatBtn = document.getElementById('clearChatBtn');
const errorToast = document.getElementById('errorToast');
const errorMessage = document.getElementById('errorMessage');
const voiceButton = document.getElementById('voice-button');

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    autoResizeTextarea();
});

// ============================================
// EVENT LISTENERS
// ============================================

function initializeEventListeners() {
    chatForm.addEventListener('submit', handleTextSubmit);
    imageButton.addEventListener('click', handleGenerateImage);

    messageInput.addEventListener('input', autoResizeTextarea);
    messageInput.addEventListener('keydown', handleKeyDown);
    clearChatBtn.addEventListener('click', handleClearChat);
    voiceButton.addEventListener('click', toggleVoiceMode);

    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            messageInput.value = chip.getAttribute('data-suggestion');
            messageInput.focus();
            autoResizeTextarea();
        });
    });
}

// ============================================
// INPUT LOCKING
// ============================================

function lockInput(placeholder) {
    isWaitingForResponse = true;
    messageInput.disabled = true;
    messageInput.dataset.originalPlaceholder = messageInput.placeholder;
    messageInput.placeholder = placeholder;
    messageInput.value = '';
    sendButton.disabled = true;
    imageButton.disabled = true;
    voiceButton.disabled = true;
}

function unlockInput() {
    isWaitingForResponse = false;
    messageInput.disabled = false;
    messageInput.placeholder =
        messageInput.dataset.originalPlaceholder || 'Type your message here...';
    sendButton.disabled = false;
    imageButton.disabled = false;
    voiceButton.disabled = false;
    messageInput.focus();
}

// ============================================
// TEXT SUBMISSION
// ============================================

async function handleTextSubmit(e) {
    e.preventDefault();

    const message = messageInput.value.trim();
    if (!message || isWaitingForResponse) return;

    messageInput.value = '';
    messageInput.style.height = 'auto';
    document.querySelector('.welcome-section')?.remove();

    addMessage(message, 'user');
    showTypingIndicator();
    lockInput('Thinking...');

    try {
        const response = await fetch(`${API_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, conversationId })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || 'Request failed');
        }

        const data = await response.json();

        if (voiceMode) talk(data.message);

        conversationId = data.conversationId;
        addMessage(data.message, 'ai');

    } catch (error) {
        console.error('Chat error:', error);
        showError(error.message);
    } finally {
        hideTypingIndicator();
        unlockInput();
        if (voiceMode) listen();
    }
}

// ============================================
// IMAGE GENERATION
// ============================================

// ============================================
// IMAGE GENERATION (BACKEND-BASED)
// ============================================

async function handleGenerateImage() {
    const prompt = messageInput.value.trim();
    if (!prompt || isWaitingForResponse) return;

    lockInput('Generating image...');
    document.querySelector('.welcome-section')?.remove();
    addMessage(prompt, 'user');
    showTypingIndicator();

    try {
        // 1️⃣ Create image generation job
        const createRes = await fetch(`${API_BASE_URL}/api/image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        if (!createRes.ok) {
            throw new Error('Failed to start image generation');
        }

        const { jobId } = await createRes.json();

        // 2️⃣ Poll for completion
        const imageUrl = await pollImageJob(jobId);

        // 3️⃣ Display image
        addImageMessage(imageUrl);

    } catch (error) {
        console.error('Image generation error:', error);
        showError(error.message || 'Image generation failed');
    } finally {
        hideTypingIndicator();
        unlockInput();
    }
}

// ============================================
// IMAGE JOB POLLING
// ============================================

async function pollImageJob(jobId) {
    const POLL_INTERVAL = 3000; // 3 seconds
    const TIMEOUT = 3 * 60 * 1000; // 3 minutes
    const startTime = Date.now();

    while (true) {
        if (Date.now() - startTime > TIMEOUT) {
            throw new Error('Image generation timed out');
        }

        const res = await fetch(`${API_BASE_URL}/api/image/${jobId}`);
        if (!res.ok) {
            throw new Error('Failed to fetch image status');
        }

        const data = await res.json();

        if (data.status === 'done') {
            return data.imageUrl; // URL or base64
        }

        if (data.status === 'error') {
            throw new Error(data.error || 'Image generation failed');
        }

        // Still processing
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
}

// ============================================
// ADD MESSAGE TO CHAT
// ============================================

function addMessage(text, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = type === 'user' ? 'You' : 'AI';

    const content = document.createElement('div');
    content.className = 'message-content';

    const messageText = document.createElement('p');
    messageText.className = 'message-text';
    messageText.textContent = text;

    const timestamp = document.createElement('div');
    timestamp.className = 'message-timestamp';
    timestamp.textContent = formatTime(new Date());

    content.appendChild(messageText);
    content.appendChild(timestamp);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    chatMessages.appendChild(messageDiv);

    scrollToBottom();
}

function addImageMessage(imageUrl) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = 'AI';

    const content = document.createElement('div');
    content.className = 'message-content';

    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = 'Generated image';
    img.style.maxWidth = '100%';
    img.style.borderRadius = '12px';

    const timestamp = document.createElement('div');
    timestamp.className = 'message-timestamp';
    timestamp.textContent = formatTime(new Date());

    content.appendChild(img);
    content.appendChild(timestamp);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    chatMessages.appendChild(messageDiv);

    scrollToBottom();
}

// ============================================
// VOICE MODE
// ============================================

function toggleVoiceMode() {
    voiceMode = !voiceMode;

    if (voiceMode) {
        voiceButton.style.backgroundColor = '#808080';
        voiceButton.style.color = 'white';
        listen();
    } else {
        voiceButton.style.backgroundColor = '';
        voiceButton.style.color = '';
        messageInput.placeholder =
            'Type your message here... (Press Enter to send, Shift+Enter for new line)';
    }
}

function listen() {
    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        alert('Your browser does not support the Web Speech API.');
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        messageInput.placeholder = 'Listening...';
    };

    recognition.onresult = (event) => {
        messageInput.value = event.results[0][0].transcript;
        autoResizeTextarea();
        messageInput.focus();
    };

    recognition.start();
}

function talk(words) {
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(words));
}

// ============================================
// UI HELPERS
// ============================================

function showTypingIndicator() {
    typingIndicator.style.display = 'flex';
    scrollToBottom();
}

function hideTypingIndicator() {
    typingIndicator.style.display = 'none';
}

function autoResizeTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height =
        Math.min(messageInput.scrollHeight, 150) + 'px';
}

// ============================================
// KEYBOARD HANDLING
// ============================================

function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !isWaitingForResponse) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit'));
    }
}

// ============================================
// CLEAR CHAT
// ============================================

async function handleClearChat() {
    if (!confirm('Clear the conversation?')) return;

    try {
        if (conversationId) {
            await fetch(`${API_BASE_URL}/api/chat/${conversationId}`, {
                method: 'DELETE'
            });
        }

        conversationId = null;
        chatMessages.innerHTML = '';
        location.reload();
    } catch (error) {
        console.error(error);
        showError('Failed to clear conversation');
    }
}

// ============================================
// ERROR HANDLING
// ============================================

function showError(message) {
    errorMessage.textContent = message;
    errorToast.classList.add('show');
    setTimeout(() => errorToast.classList.remove('show'), 5000);
}

// ============================================
// UTILITIES
// ============================================

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatTime(date) {
    return `${date.getHours().toString().padStart(2, '0')}:${date
        .getMinutes()
        .toString()
        .padStart(2, '0')}`;
}
