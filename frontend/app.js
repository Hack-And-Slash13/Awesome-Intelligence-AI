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

    addMessage(message, 'user');
    lockInput('Thinking...');

    try {
        const response = await fetch(`${API_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, conversationId })
        });

        if (!response.ok) throw new Error(await response.text());

        const data = await response.json();
        conversationId = data.conversationId;

        addMessage(data.message, 'ai');
        if (voiceMode) talk(data.message);

    } catch (error) {
        console.error(error);
        showError(error.message);
    } finally {
        unlockInput();
        if (voiceMode) listen();
    }
}

// ============================================
// IMAGE GENERATION
// ============================================

async function handleGenerateImage() {
    const prompt = messageInput.value.trim();
    if (!prompt || isWaitingForResponse) return;

    addMessage(prompt, 'user');
    lockInput('Generating image...');

    const statusMessage = addMessage('⏳ Generating image...', 'ai');

    try {
        const res = await fetch(`${API_BASE_URL}/api/image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        if (!res.ok) throw new Error('Image generation failed');

        const { imageUrl } = await res.json();

        replaceMessageWithImage(statusMessage, imageUrl);

    } catch (error) {
        console.error(error);
        statusMessage.querySelector('.message-text').textContent =
            '❌ Image generation failed';
        showError(error.message);
    } finally {
        unlockInput();
    }
}


// ============================================
// IMAGE JOB POLLING
// ============================================

async function pollImageJob(jobId) {
    const POLL_INTERVAL = 3000;
    const TIMEOUT = 3 * 60 * 1000;
    const startTime = Date.now();

    while (true) {
        if (Date.now() - startTime > TIMEOUT) {
            throw new Error('Image generation timed out');
        }

        const res = await fetch(`${API_BASE_URL}/api/image/${jobId}`);
        if (!res.ok) throw new Error('Failed to fetch image status');

        const data = await res.json();

        if (data.status === 'done') return data.imageUrl;
        if (data.status === 'error') throw new Error(data.error);

        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
}

// ============================================
// MESSAGE HELPERS
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
    return messageDiv; // ⭐ IMPORTANT
}

function replaceMessageWithImage(messageDiv, imageUrl) {
    const content = messageDiv.querySelector('.message-content');
    content.innerHTML = '';

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
    scrollToBottom();
}

// ============================================
// VOICE MODE
// ============================================

function toggleVoiceMode() {
    voiceMode = !voiceMode;
    if (voiceMode) listen();
}

function listen() {
    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
        messageInput.value = event.results[0][0].transcript;
        autoResizeTextarea();
    };

    recognition.start();
}

function talk(words) {
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(words));
}

// ============================================
// UI HELPERS
// ============================================

function autoResizeTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height =
        Math.min(messageInput.scrollHeight, 150) + 'px';
}

function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !isWaitingForResponse) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit'));
    }
}

function handleClearChat() {
    chatMessages.innerHTML = '';
    conversationId = null;
}

function showError(message) {
    errorMessage.textContent = message;
    errorToast.classList.add('show');
    setTimeout(() => errorToast.classList.remove('show'), 5000);
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatTime(date) {
    return `${date.getHours().toString().padStart(2, '0')}:${date
        .getMinutes()
        .toString()
        .padStart(2, '0')}`;
}
