// models/meme.js
const mongoose = require('mongoose');

const MemeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  imageUrl: {
    type: String,
    required: true,
  },
  tags: {
    type: [String], // Array of strings for tags
    default: [],
  },
  caption: {
    type: String,
    default: 'Generating caption...', // Default placeholder during AI processing
  },
  vibe: {
    type: String,
    default: 'Analyzing vibe...', // Default placeholder during AI processing
  },
  upvotes: {
    type: Number,
    default: 0,
  },
  downvotes: { // Added based on your latest schema
    type: Number,
    default: 0,
  },
  highestBid: {
    type: Number,
    default: 0,
  },
  highestBidder: { // Can still be a string for mock users, or change to ref: 'User' later
    type: String,
    default: 'No bids yet',
  },
  owner: { // Link to the User who created the meme
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true, // A meme must have an owner
  },
  // To track users who have voted on this specific meme (prevent multiple votes)
  // Store ObjectId of the user and their vote type ('up' or 'down')
  votedUsers: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      voteType: {
        type: String, // 'up' or 'down'
        enum: ['up', 'down'],
        required: true,
      },
      _id: false // Do not create an _id for sub-documents in this array
    }
  ],
}, {
  timestamps: true, // Adds createdAt and updatedAt timestamps
});

const Meme = mongoose.model('Meme', MemeSchema);

module.exports = Meme;
