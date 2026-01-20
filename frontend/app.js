// ============================================
// CONFIGURATION
// ============================================

// Use same-origin API (works locally + on Render)
const API_BASE_URL = '';

// ============================================
// STATE MANAGEMENT
// ============================================

let conversationId = null;
let isWaitingForResponse = false;

// ============================================
// DOM ELEMENTS
// ============================================

const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const typingIndicator = document.getElementById('typingIndicator');
const clearChatBtn = document.getElementById('clearChatBtn');
const errorToast = document.getElementById('errorToast');
const errorMessage = document.getElementById('errorMessage');

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
    chatForm.addEventListener('submit', handleSubmit);
    messageInput.addEventListener('input', autoResizeTextarea);
    messageInput.addEventListener('keydown', handleKeyDown);
    clearChatBtn.addEventListener('click', handleClearChat);

    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            messageInput.value = chip.getAttribute('data-suggestion');
            messageInput.focus();
            autoResizeTextarea();
        });
    });
}

// ============================================
// FORM SUBMISSION HANDLER
// ============================================

async function handleSubmit(e) {
    e.preventDefault();

    const message = messageInput.value.trim();
    if (!message || isWaitingForResponse) return;

    messageInput.value = '';
    messageInput.style.height = 'auto';

    document.querySelector('.welcome-section')?.remove();

    addMessage(message, 'user');
    showTypingIndicator();

    isWaitingForResponse = true;
    sendButton.disabled = true;

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

        conversationId = data.conversationId;
        hideTypingIndicator();
        addMessage(data.message, 'ai');

    } catch (error) {
        console.error('Chat error:', error);
        hideTypingIndicator();
        showError(error.message);
    } finally {
        isWaitingForResponse = false;
        sendButton.disabled = false;
        messageInput.focus();
    }
}

// ============================================
// MESSAGE DISPLAY
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

// ============================================
// TYPING INDICATOR
// ============================================

function showTypingIndicator() {
    typingIndicator.style.display = 'flex';
    scrollToBottom();
}

function hideTypingIndicator() {
    typingIndicator.style.display = 'none';
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
// TEXTAREA AUTO-RESIZE
// ============================================

function autoResizeTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
}

// ============================================
// KEYBOARD HANDLING
// ============================================

function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit'));
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
