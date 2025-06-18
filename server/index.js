// index.js
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const Meme = require('./models/meme');
const User = require('./models/user');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'PUT']
  }
});

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/memehustle';
const JWT_SECRET = process.env.JWT_SECRET;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- IMPORTANT: Gemini AI Client Initialization ---
let genAI;
if (GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  console.log("✅ Gemini AI client initialized with AI Studio API Key.");
} else {
  console.warn("⚠️ Gemini AI API key not set in .env. AI generation will use fallbacks.");
  genAI = {
    getGenerativeModel: () => ({
      generateContent: () => ({ response: { text: () => "AI functionality disabled." } })
    })
  };
}
// --- END Gemini AI Client Initialization ---

app.use(cors());
app.use(express.json());

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

const geminiResponseCache = {};

async function urlToBase64(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const mimeType = response.headers['content-type'] || 'image/jpeg';
    const base64 = Buffer.from(response.data).toString('base64');
    return { inlineData: { data: base64, mimeType } };
  } catch (error) {
    console.error(`Error fetching image for base64 conversion from ${url}:`, error.message);
    const placeholderUrl = "https://placehold.co/400x300/4a004a/ffffff?text=Image+Load+Fail";
    const placeholderResponse = await axios.get(placeholderUrl, { responseType: 'arraybuffer' });
    const placeholderMimeType = placeholderResponse.headers['content-type'] || 'image/png';
    const placeholderBase64 = Buffer.from(placeholderResponse.data).toString('base64');
    console.warn("Using placeholder image for AI analysis due to original image load failure.");
    return { inlineData: { data: placeholderBase64, mimeType: placeholderMimeType } };
  }
}

async function generateFromImageWithGemini(imageParts, prompt, cacheKey) {
  if (!genAI || !GEMINI_API_KEY) {
    return null;
  }
  if (geminiResponseCache[cacheKey]) {
    console.log(`Cache hit for ${cacheKey}`);
    return geminiResponseCache[cacheKey];
  }
  try {
    // --- UPDATED MODEL HERE ---
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Changed from "gemini-pro-vision"
    const result = await model.generateContent([imageParts, prompt]);
    const response = await result.response;
    const text = response.text();
    if (text) {
      geminiResponseCache[cacheKey] = text;
      return text;
    }
    return null;
  } catch (err) {
    console.error("⚠️ Gemini API Error (Image Gen):", err.message);
    return null;
  }
}

const generateToken = (id) => {
  return jwt.sign({ id }, JWT_SECRET, {
    expiresIn: '1h',
  });
};

const protect = (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch (error) {
      console.error('Auth token error:', error);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }
  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

const emitLeaderboard = async () => {
  try {
    const topMemes = await Meme.find()
      .sort({ upvotes: -1, createdAt: -1 })
      .limit(10)
      .populate('owner', 'username');
    io.emit('leaderboardUpdated', topMemes);
  } catch (err) {
    console.error("Error emitting leaderboard:", err);
  }
};

setInterval(emitLeaderboard, 10000);
io.on('connection', (socket) => {
    emitLeaderboard();
});


// --- ROUTES ---

app.get('/', (req, res) => {
  res.send('🎉 Welcome to MemeHustle Backend!');
});

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const userExists = await User.findOne({ username });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }
    const user = await User.create({ username, password });
    if (user) {
      res.status(201).json({
        _id: user._id,
        username: user.username,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: "Server error during registration" });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        username: user.username,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid username or password' });
    }
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error during login" });
  }
});

app.get('/api/memes', async (req, res) => {
  try {
    const memes = await Meme.find().sort({ createdAt: -1 }).populate('owner', 'username');
    res.status(200).json(memes);
  } catch (err) {
    console.error("Fetch memes error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const topMemes = await Meme.find()
      .sort({ upvotes: -1, createdAt: -1 })
      .limit(parseInt(req.query.top) || 10)
      .populate('owner', 'username');
    res.status(200).json(topMemes);
  } catch (err) {
    console.error("Fetch leaderboard error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});


// Create meme
app.post('/api/memes', protect, async (req, res) => {
  try {
    const { title, imageUrl, tags } = req.body;
    const defaultImageUrl = 'https://placehold.co/400x300/0f0c29/00f7ff?text=CyberMeme';
    const finalImageUrl = imageUrl || defaultImageUrl;
    const tagArray = Array.isArray(tags) ? tags : (tags ? tags.split(',').map(tag => tag.trim()) : []);
    const tagPrompt = tagArray.length > 0 ? tagArray.join(', ') : 'general meme';

    let caption = "Generating caption...";
    let vibe = "Analyzing vibe...";

    const newMeme = new Meme({
      title,
      imageUrl: finalImageUrl,
      tags: tagArray,
      caption,
      vibe,
      owner: req.user.id,
    });
    await newMeme.save();

    await newMeme.populate('owner', 'username');
    io.emit('newMeme', newMeme);

    (async () => {
        let generatedCaption = "AI is offline, but this meme is still 🔥";
        let generatedVibe = "No Signal Vibes";
        try {
            const imageParts = await urlToBase64(finalImageUrl);
            const captionPrompt = `Generate a single, concise, humorous, and relevant caption (max 15 words) suitable for a "cyberpunk AI meme marketplace" based on this image and these keywords: ${tagPrompt}. Make it edgy and a bit sarcastic if appropriate. Provide ONLY the caption text. No introductions, options, or conversational filler.`;
            const captionResult = await generateFromImageWithGemini(imageParts, captionPrompt, `caption-${newMeme._id}`);
            generatedCaption = captionResult || generatedCaption;

            const vibePrompt = `Analyze the overall mood and aesthetic of this meme. Describe its "vibe" in 1-3 words (e.g., "dystopian", "sarcastic", "chaotic", "futuristic humor") based on this image and these keywords: ${tagPrompt}. Provide ONLY the vibe description. No explanations or conversational text.`;
            const vibeResult = await generateFromImageWithGemini(imageParts, vibePrompt, `vibe-${newMeme._id}`);
            generatedVibe = vibeResult || generatedVibe;
        } catch (aiErr) {
            console.error("AI Generation Error during meme creation:", aiErr.message);
        } finally {
            newMeme.caption = generatedCaption;
            newMeme.vibe = generatedVibe;
            await newMeme.save();
            await newMeme.populate('owner', 'username');
            io.emit('memeUpdated', newMeme);
        }
    })();

    emitLeaderboard();
    res.status(201).json(newMeme);
  } catch (err) {
    console.error("Create meme error:", err);
    res.status(400).json({ message: "Error creating meme" });
  }
});

app.post('/api/memes/:id/vote', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body;
    const userId = req.user.id;

    if (!['up', 'down'].includes(type)) {
      return res.status(400).json({ message: 'Invalid vote type. Must be "up" or "down".' });
    }

    const meme = await Meme.findById(id);
    if (!meme) {
      return res.status(404).json({ message: 'Meme not found' });
    }

    const existingVoteIndex = meme.votedUsers.findIndex(vote => vote.userId.toString() === userId);

    if (existingVoteIndex !== -1) {
      const existingVote = meme.votedUsers[existingVoteIndex];

      if (existingVote.voteType === type) {
        meme.votedUsers.splice(existingVoteIndex, 1);
        if (type === 'up') {
          meme.upvotes = Math.max(0, meme.upvotes - 1);
        } else {
          meme.downvotes = Math.max(0, meme.downvotes - 1);
        }
        await meme.save();
        await meme.populate('owner', 'username');
        io.emit('memeUpdated', meme);
        emitLeaderboard();
        return res.status(200).json({ message: `Vote ${type} removed!`, meme });

      } else {
        if (existingVote.voteType === 'up' && type === 'down') {
          meme.upvotes = Math.max(0, meme.upvotes - 1);
          meme.downvotes += 1;
        } else if (existingVote.voteType === 'down' && type === 'up') {
          meme.downvotes = Math.max(0, meme.downvotes - 1);
          meme.upvotes += 1;
        }
        meme.votedUsers[existingVoteIndex].voteType = type;
        await meme.save();
        await meme.populate('owner', 'username');
        io.emit('memeUpdated', meme);
        emitLeaderboard();
        return res.status(200).json({ message: `Vote changed to ${type}!`, meme });
      }
    } else {
      meme.votedUsers.push({ userId, voteType: type });
      if (type === 'up') {
        meme.upvotes += 1;
      } else {
        meme.downvotes += 1;
      }
      await meme.save();
      await meme.populate('owner', 'username');
      io.emit('memeUpdated', meme);
      emitLeaderboard();
      return res.status(200).json({ message: `Voted ${type} successfully!`, meme });
    }
  } catch (err) {
    console.error(`Error ${req.body.type}voting meme:`, err);
    res.status(500).json({ message: `Failed to ${req.body.type}vote meme.` });
  }
});


// Manual caption/vibe generation (re-generate)
app.post('/api/memes/:id/caption', protect, async (req, res) => {
  try {
    const meme = await Meme.findById(req.params.id);
    if (!meme) return res.status(404).json({ message: "Meme not found" });

    meme.caption = "Re-generating caption...";
    meme.vibe = "Re-analyzing vibe...";
    await meme.save();
    await meme.populate('owner', 'username');
    io.emit('memeUpdated', meme);

    const tagPrompt = meme.tags.length > 0 ? meme.tags.join(', ') : 'general meme';

    delete geminiResponseCache[`caption-${meme._id}`];
    delete geminiResponseCache[`vibe-${meme._id}`];

    let generatedCaption = "Re-gen failed. Still awesome!";
    let generatedVibe = "AI Glitch Vibes";

    try {
        const imageParts = await urlToBase64(meme.imageUrl);

        const captionPrompt = `Generate a concise, humorous, and relevant caption (max 15 words) suitable for a "cyberpunk AI meme marketplace" based on this image and these keywords: ${tagPrompt}. Make it edgy and a bit sarcastic if appropriate.`;
        const captionResult = await generateFromImageWithGemini(imageParts, captionPrompt, `caption-${meme._id}`);
        generatedCaption = captionResult || generatedCaption;

        const vibePrompt = `Analyze the overall mood and aesthetic of this meme. Describe its "vibe" in 1-3 words (e.g., "dystopian", "sarcastic", "chaotic", "futuristic humor") based on this image and these keywords: ${tagPrompt}.`;
        const vibeResult = await generateFromImageWithGemini(imageParts, vibePrompt, `vibe-${meme._id}`);
        generatedVibe = vibeResult || generatedVibe;

    } catch (aiErr) {
        console.error("AI Generation Error during re-captioning (inside try-catch):", aiErr.message);
    } finally {
        meme.caption = generatedCaption;
        meme.vibe = generatedVibe;
        await meme.save();
        await meme.populate('owner', 'username');
        io.emit('memeUpdated', meme);
    }

    res.status(200).json({ message: "AI generation triggered." });
  } catch (err) {
    console.error("Caption update error (outer catch):", err);
    res.status(500).json({ message: "Internal server error" });
  }
});


app.post('/api/memes/:id/bid', protect, async (req, res) => {
  const { credits } = req.body;
  const userId = req.user.id;
  try {
    const meme = await Meme.findById(req.params.id);
    if (!meme) return res.status(404).json({ message: "Meme not found" });

    const bidAmount = parseInt(credits, 10);
    if (isNaN(bidAmount) || bidAmount <= 0) {
      return res.status(400).json({ message: "Bid credits must be a positive number." });
    }

    if (bidAmount > (meme.highestBid || 0)) {
      meme.highestBid = bidAmount;
      const bidderUser = await User.findById(userId);
      meme.highestBidder = bidderUser ? bidderUser.username : 'Anonymous Hacker';
      await meme.save();
      await meme.populate('owner', 'username');
      io.emit('memeUpdated', meme);
    } else {
      return res.status(400).json({ message: "Your bid must be higher than the current highest bid." });
    }

    res.status(200).json(meme);
  } catch (err) {
    console.error("Bid error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

app.delete('/api/memes/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const meme = await Meme.findById(id);
    if (!meme) return res.status(404).json({ message: "Meme not found" });

    if (meme.owner.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized to delete this meme" });
    }

    await Meme.findByIdAndDelete(id);

    io.emit('deleteMeme', id);
    emitLeaderboard();
    res.status(204).end();
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
