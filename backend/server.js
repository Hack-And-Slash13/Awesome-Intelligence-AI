require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const HF_API_TOKEN = process.env.HF_API_TOKEN; // Add your Hugging Face token

// ==============================
// WARNINGS
// ==============================
if (!GITHUB_TOKEN) {
    console.warn('⚠️ GITHUB_TOKEN not set. Chat will not work.');
}
if (!HF_API_TOKEN) {
    console.warn('⚠️ HF_API_TOKEN not set. Image generation will fail.');
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
// CHAT ENDPOINT
// ==============================
app.post('/api/chat', async (req, res) => {
    try {
        const { message, conversationId } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        const sessionId = conversationId || generateSessionId();
        let history = conversationHistory.get(sessionId) || [];
        history.push({ role: 'user', content: message });

        const messages = history.map(m => ({ role: m.role, content: m.content }));

        if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

        const response = await axios.post(
            'https://models.inference.ai.azure.com/chat/completions',
            { model: 'gpt-4o-mini', messages, temperature: 0.7, max_tokens: 500 },
            { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 30000 }
        );

        const aiMessage = response.data?.choices?.[0]?.message?.content?.trim() || 'No response';
        history.push({ role: 'assistant', content: aiMessage });

        if (history.length > 20) history = history.slice(-20);
        conversationHistory.set(sessionId, history);

        res.json({ message: aiMessage, conversationId: sessionId });

    } catch (error) {
        console.error('Chat error:', error.response?.data || error.message);
        if (error.response?.status === 401) return res.status(401).json({ error: 'Invalid GitHub token' });
        if (error.response?.status === 429) return res.status(429).json({ error: 'Rate limit exceeded' });
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
// IMAGE GENERATION (HUGGING FACE)
// ==============================
// ==============================
// CREATE IMAGE JOB (Hugging Face Stable Diffusion)
// ==============================
app.post('/api/image', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

        const HF_API_TOKEN = process.env.HF_API_TOKEN;
        if (!HF_API_TOKEN) return res.status(500).json({ error: 'HF_API_TOKEN not set' });

        const modelID = 'stabilityai/stable-diffusion-2-1';

        // Optional: immediately respond with a jobId if you want async behavior
        const jobId = generateJobId();
        imageJobs.set(jobId, { id: jobId, prompt, status: 'processing', imageUrl: null, createdAt: Date.now() });
        res.json({ jobId }); // frontend can poll /api/image/:jobId

        // Call Hugging Face Inference API
        const response = await axios.post(
            `https://api-inference.huggingface.co/models/${modelID}`,
            { inputs: prompt },
            {
                headers: { Authorization: `Bearer ${HF_API_TOKEN}` },
                responseType: 'arraybuffer', // get image binary
                validateStatus: () => true // handle errors manually
            }
        );

        // Handle errors returned as JSON
        const contentType = response.headers['content-type'];
        if (contentType?.includes('application/json')) {
            const errorData = JSON.parse(Buffer.from(response.data).toString('utf8'));
            console.error('HF error:', errorData);
            imageJobs.set(jobId, { ...imageJobs.get(jobId), status: 'error', imageUrl: null });
            return;
        }

        // Save image to generated folder
        const imageBuffer = Buffer.from(response.data, 'binary');
        const outputFile = `img_${jobId}.png`;
        const outputPath = path.join(generatedPath, outputFile);
        fs.writeFileSync(outputPath, imageBuffer);

        // Update job
        imageJobs.set(jobId, {
            ...imageJobs.get(jobId),
            status: 'done',
            imageUrl: `/generated/${outputFile}`
        });

    } catch (err) {
        console.error('Image generation error:', err.message);
    }
});

// ==============================
// HEALTH CHECK
// ==============================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        activeConversations: conversationHistory.size
    });
});

// ==============================
// CLEANUP OLD DATA
// ==============================
const ONE_HOUR = 60 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    for (const [id] of conversationHistory.entries()) {
        const timestamp = Number(id.split('_')[1]);
        if (timestamp && now - timestamp > ONE_HOUR) conversationHistory.delete(id);
    }
}, ONE_HOUR);

// ==============================
// START SERVER
// ==============================
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 GITHUB_TOKEN: ${GITHUB_TOKEN ? 'SET' : 'NOT SET'}`);
    console.log(`🖼 HF_API_TOKEN: ${HF_API_TOKEN ? 'SET' : 'NOT SET'}`);
});
