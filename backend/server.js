// server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const generatedPath = path.join(__dirname, 'generated');
if (!fs.existsSync(generatedPath)) fs.mkdirSync(generatedPath, { recursive: true });

const app = express();
const PORT = process.env.PORT || 10000;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// ==============================
// WARNINGS
// ==============================
if (!GITHUB_TOKEN) {
    console.warn('⚠️ GITHUB_TOKEN not set. Chat will not work.');
}

// ==============================
// MIDDLEWARE
// ==============================
app.use(cors());
app.use(express.json());

// ==============================
// STATIC FILES (FRONTEND)
// ==============================
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// ==============================
// CHAT STATE
// ==============================
const conversationHistory = new Map();

function generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ==============================
// IMAGE JOB STATE (IN-MEMORY)
// ==============================
const imageJobs = new Map();

function generateJobId() {
    return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ==============================
// CHAT ENDPOINT
// ==============================
app.post('/api/chat', async (req, res) => {
    try {
        const { message, conversationId } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const sessionId = conversationId || generateSessionId();
        let history = conversationHistory.get(sessionId) || [];

        history.push({ role: 'user', content: message });

        const messages = history.map(m => ({
            role: m.role,
            content: m.content
        }));

        if (!GITHUB_TOKEN) {
            return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });
        }

        const response = await axios.post(
            'https://models.inference.ai.azure.com/chat/completions',
            {
                model: 'gpt-4o-mini',
                messages,
                temperature: 0.7,
                max_tokens: 500
            },
            {
                headers: {
                    Authorization: `Bearer ${GITHUB_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        const aiMessage =
            response.data?.choices?.[0]?.message?.content?.trim() ||
            'No response';

        history.push({ role: 'assistant', content: aiMessage });

        // Keep last 20 messages
        if (history.length > 20) {
            history = history.slice(-20);
        }

        conversationHistory.set(sessionId, history);

        res.json({
            message: aiMessage,
            conversationId: sessionId
        });

    } catch (error) {
        console.error('Chat error:', error.response?.data || error.message);

        if (error.response?.status === 401) {
            return res.status(401).json({ error: 'Invalid GitHub token' });
        }

        if (error.response?.status === 429) {
            return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        res.status(500).json({ error: 'Failed to get AI response' });
    }
});

// ==============================
// CLEAR CONVERSATION
// ==============================
app.delete('/api/chat/:conversationId', (req, res) => {
    const { conversationId } = req.params;

    if (conversationHistory.has(conversationId)) {
        conversationHistory.delete(conversationId);
        return res.json({ message: 'Conversation cleared' });
    }

    res.status(404).json({ error: 'Conversation not found' });
});

// ==============================
// CREATE IMAGE JOB
// ==============================
app.post('/api/image', (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const jobId = generateJobId();

        imageJobs.set(jobId, {
            id: jobId,
            prompt,
            status: 'processing',
            imageUrl: null,
            createdAt: Date.now()
        });

        const { spawn } = require('child_process');

const outputFile = `img_${jobId}.png`;
const outputPath = path.join(__dirname, 'generated', outputFile);

// Spawn Python worker
const worker = spawn('python3', [
    'worker/vqgan_worker.py',
    '--prompt', prompt,
    '--output', outputPath
]);
;

worker.stdout.on('data', data => {
    console.log(`[VQGAN] ${data}`);
});

worker.stderr.on('data', data => {
    console.error(`[VQGAN ERROR] ${data}`);
});

worker.on('close', code => {
    const job = imageJobs.get(jobId);
    if (!job) return;

    if (code === 0) {
        imageJobs.set(jobId, {
            ...job,
            status: 'done',
            imageUrl: `/generated/${outputFile}`
        });
    } else {
        imageJobs.set(jobId, {
            ...job,
            status: 'error'
        });
    }
});


        res.json({ jobId });

    } catch (error) {
        console.error('Image job creation error:', error);
        res.status(500).json({ error: 'Failed to create image job' });
    }
});

// ==============================
// IMAGE JOB STATUS
// ==============================
app.get('/api/image/:jobId', (req, res) => {
    const { jobId } = req.params;

    const job = imageJobs.get(jobId);
    if (!job) {
        return res.status(404).json({ error: 'Image job not found' });
    }

    res.json({
        status: job.status,
        imageUrl: job.imageUrl
    });
});

// ==============================
// HEALTH CHECK
// ==============================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        activeConversations: conversationHistory.size,
        imageJobs: imageJobs.size
    });
});

// ==============================
// CLEANUP OLD DATA
// ==============================
setInterval(() => {
    const ONE_HOUR = 60 * 60 * 1000;
    const now = Date.now();

    for (const [id] of conversationHistory.entries()) {
        const timestamp = Number(id.split('_')[1]);
        if (timestamp && now - timestamp > ONE_HOUR) {
            conversationHistory.delete(id);
        }
    }
}, ONE_HOUR);

setInterval(() => {
    const TEN_MINUTES = 10 * 60 * 1000;
    const now = Date.now();

    for (const [jobId, job] of imageJobs.entries()) {
        if (now - job.createdAt > TEN_MINUTES) {
            imageJobs.delete(jobId);
        }
    }
}, 5 * 60 * 1000);

app.use('/generated', express.static(generatedPath));

// ==============================
// START SERVER
// ==============================
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 GITHUB_TOKEN: ${GITHUB_TOKEN ? 'SET' : 'NOT SET'}`);
});
