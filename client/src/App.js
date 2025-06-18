// App.js
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import AuthForm from './components/AuthForm'; // Import the new AuthForm component
import './App.css';

// Ensure this URL matches your backend server
const socket = io('http://localhost:5000');

function App() {
  const [memes, setMemes] = useState([]);
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [tags, setTags] = useState('');
  const [bidInputs, setBidInputs] = useState({});
  const [leaderboard, setLeaderboard] = useState([]);
  const [hackerText, setHackerText] = useState('');
  const typingRef = useRef(null); // Ref to store the timeout ID

  // --- Authentication State ---
  const [currentUser, setCurrentUser] = useState(null); // Stores { _id, username, token }

  // Check for token in localStorage on initial load
  useEffect(() => {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setCurrentUser(user);
        // Set default Authorization header for all axios requests
        axios.defaults.headers.common['Authorization'] = `Bearer ${user.token}`;
      } catch (e) {
        console.error("Failed to parse stored user data:", e);
        localStorage.removeItem('currentUser'); // Clear invalid data
      }
    }
  }, []); // Run only once on mount

  // Memoized function to fetch all data (memes and leaderboard)
  const fetchAllData = useCallback(async () => {
    try {
      const [memesRes, leaderboardRes] = await Promise.all([
        axios.get('/api/memes'), // Now includes owner username
        axios.get('/api/leaderboard?top=10') // Also includes owner username
      ]);
      setMemes(memesRes.data);
      setLeaderboard(leaderboardRes.data);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  }, []); // fetchAllData is stable

  // Function to handle successful authentication (login/register)
  const handleAuthSuccess = useCallback((userData) => {
    setCurrentUser(userData);
    localStorage.setItem('currentUser', JSON.stringify(userData)); // Store user in localStorage
    axios.defaults.headers.common['Authorization'] = `Bearer ${userData.token}`; // Set token for axios
    fetchAllData(); // Refresh data with authenticated user's context
  }, [fetchAllData]); // Added fetchAllData to dependencies

  // Function to handle logout
  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
    delete axios.defaults.headers.common['Authorization']; // Remove token from axios headers
    fetchAllData(); // Refresh data after logout (e.g., memes created by logged out user will still show but actions require login)
  }, [fetchAllData]); // Added fetchAllData to dependencies

  // Memoize terminalMessages so it doesn't change on every render
  const terminalMessages = useMemo(() => [
    "Hacking into the MemeStream...",
    "Decrypting dank vibes...",
    "Initiating bidding protocol...",
    "Uploading NeuralNet captions...",
    "Welcome, Cyber-Memelord."
  ], []);

  const typeWriterEffect = useCallback(() => {
    let messageIndex = 0;
    let charIndex = 0;
    let isDeleting = false;

    const type = () => {
      if (typingRef.current) clearTimeout(typingRef.current);

      const fullTxt = terminalMessages[messageIndex];

      if (isDeleting) {
        charIndex--;
      } else {
        charIndex++;
      }

      setHackerText(fullTxt.substring(0, charIndex));

      let typeSpeed = 100;
      if (isDeleting) {
        typeSpeed /= 2;
      }

      if (!isDeleting && charIndex === fullTxt.length) {
        typeSpeed = 1500;
        isDeleting = true;
      } else if (isDeleting && charIndex === 0) {
        isDeleting = false;
        messageIndex = (messageIndex + 1) % terminalMessages.length;
        typeSpeed = 500;
      }

      typingRef.current = setTimeout(type, typeSpeed);
    };

    typingRef.current = setTimeout(type, 500);

    return () => {
      if (typingRef.current) {
        clearTimeout(typingRef.current);
      }
    };
  }, [terminalMessages]);

  useEffect(() => {
    // Only fetch data if currentUser is set or if we are not logged in (to see public content)
    // If we're logged in, fetchAllData will be called by handleAuthSuccess
    if (!currentUser) { // If no user is logged in, fetch public data
      fetchAllData();
    } else { // If a user is logged in (e.g., on refresh), make sure data is up-to-date
        fetchAllData();
    }
    const cleanupTyping = typeWriterEffect();

    socket.on('newMeme', (newMeme) => {
      setMemes(prevMemes => [newMeme, ...prevMemes]);
      fetchAllData();
    });

    socket.on('memeUpdated', (updatedMeme) => {
      setMemes(prevMemes => prevMemes.map(meme =>
        meme._id === updatedMeme._id ? updatedMeme : meme
      ));
      fetchAllData();
    });

    socket.on('deleteMeme', (deletedMemeId) => {
      setMemes(prevMemes => prevMemes.filter(meme => meme._id !== deletedMemeId));
      fetchAllData();
    });

    socket.on('leaderboardUpdated', (topMemes) => {
      setLeaderboard(topMemes);
    });

    return () => {
      cleanupTyping();
      socket.off('newMeme');
      socket.off('memeUpdated');
      socket.off('deleteMeme');
      socket.off('leaderboardUpdated');
      socket.disconnect();
    };
  }, [fetchAllData, typeWriterEffect, currentUser]);


  // --- Event Handlers (require authentication) ---

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser) {
      alert("Please log in to create a meme.");
      return;
    }
    const tagArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
    try {
      await axios.post('/api/memes', { title, imageUrl, tags: tagArray });
      setTitle('');
      setImageUrl('');
      setTags('');
    } catch (err) {
      console.error("Error adding meme:", err.response?.data?.message || err.message);
      alert("Failed to add meme: " + (err.response?.data?.message || "Server error."));
    }
  };

  const handleDelete = async (id) => {
    if (!currentUser) {
      alert("Please log in to delete a meme.");
      return;
    }
    if (window.confirm("Are you sure you want to delete this meme?")) {
      try {
        await axios.delete(`/api/memes/${id}`);
      } catch (err) {
        console.error("Error deleting meme:", err.response?.data?.message || err.message);
        alert("Failed to delete meme: " + (err.response?.data?.message || "Server error."));
      }
    }
  };

  const handleBid = async (id) => {
    if (!currentUser) {
      alert("Please log in to place a bid.");
      return;
    }
    const credits = parseInt(bidInputs[id], 10);
    if (isNaN(credits) || credits <= 0) {
      alert("Enter a valid positive number of credits to bid.");
      return;
    }
    try {
      await axios.post(`/api/memes/${id}/bid`, { credits });
      setBidInputs({ ...bidInputs, [id]: '' });
    } catch (err) {
      console.error("Error placing bid:", err.response?.data?.message || err.message);
      alert("Failed to place bid: " + (err.response?.data?.message || "Server error."));
    }
  };

  const handleVote = async (id, type) => {
    if (!currentUser) {
      alert("Please log in to vote.");
      return;
    }
    try {
      await axios.post(`/api/memes/${id}/vote`, { type });
    } catch (err) {
      console.error(`Error ${type}voting meme:`, err.response?.data?.message || err.message);
      alert(`Failed to ${type}vote meme: ` + (err.response?.data?.message || "Server error."));
    }
  };

  const handleCaption = async (id) => {
    if (!currentUser) {
      alert("Please log in to generate captions.");
      return;
    }
    try {
      await axios.post(`/api/memes/${id}/caption`);
    } catch (err) {
      console.error("Error generating caption:", err.response?.data?.message || err.message);
      alert("Failed to generate caption/vibe: " + (err.response?.data?.message || "Server error."));
    }
  };

  return (
    <div className="app-container">
      <h1 className="title">
        <span className="glitch-text">🧠 MemeHustle</span>
        <span className="glitch-text-sub">Cyberpunk AI Meme Marketplace</span>
      </h1>

      <div className="typewriter-container">
        <p className="typewriter">{hackerText}</p>
      </div>

      {/* Conditional Rendering based on Authentication */}
      {!currentUser ? (
        <AuthForm onAuthSuccess={handleAuthSuccess} />
      ) : (
        <>
          <div className="user-info">
    <span className="user-greeting">Welcome, <span className="username-display">{currentUser.username}!</span></span>
    <button onClick={handleLogout} className="logout-button">Logout</button>
</div>

          <form className="meme-form" onSubmit={handleSubmit}>
            <input
              placeholder="Meme Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <input
              placeholder="Image URL (e.g., https://picsum.photos/400/300)"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
            <input
              placeholder="Tags (comma separated, e.g., crypto, funny)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <button type="submit">Create New Meme</button>
          </form>

          <div className="leaderboard">
            <h2>🏆 Top Cyber-Memes</h2>
            <ol>
              {leaderboard.length > 0 ? (
                leaderboard.map((meme, index) => (
                  <li key={meme._id} className="leaderboard-item">
                    <span className="leaderboard-rank">#{index + 1}</span>
                    <span className="leaderboard-title">{meme.title} by <span className="meme-owner">{meme.owner?.username || 'Unknown'}</span></span>
                    <span className="leaderboard-upvotes">{meme.upvotes || 0} <span role="img" aria-label="upvote arrow">⬆️</span></span>
                  </li>
                ))
              ) : (
                <li>No memes on the leaderboard yet. Create some!</li>
              )}
            </ol>
          </div>

          <div className="meme-grid">
            {memes.length > 0 ? (
              memes.map(meme => (
                <div className="meme-card" key={meme._id}>
                  <h3>{meme.title}</h3>
                  <p className="meme-owner-display">By: {meme.owner?.username || 'Unknown'}</p>
                  <img src={meme.imageUrl} alt={meme.title} className="meme-image" onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/400x300/4a004a/ffffff?text=Image+Missing"; }}/>

                  <div className="tag-container">
                    {meme.tags && meme.tags.map(tag => (
                      <span className="tag" key={tag}>#{tag}</span>
                    ))}
                  </div>

                  <p className="caption">📝 Caption: {meme.caption}</p>
                  <p className="vibe">🎭 Vibe: {meme.vibe}</p>
                  <p className="current-bid">💸 Highest Bid: <span className="bid-amount">{meme.highestBid || 0}</span> credits by <span className="bidder-name">{meme.highestBidder || 'N/A'}</span></p>
                  <p className="upvote-count">Upvotes: <span className="votes">{meme.upvotes || 0}</span></p>
                  <p className="downvote-count">Downvotes: <span className="votes">{meme.downvotes || 0}</span></p>

                  <div className="bid-input">
                    <input
                      type="number"
                      value={bidInputs[meme._id] || ''}
                      placeholder="Bid credits"
                      onChange={e => setBidInputs({ ...bidInputs, [meme._id]: e.target.value })}
                      min="1"
                    />
                    <button onClick={() => handleBid(meme._id)} className="bid-button">Place Bid</button>
                  </div>

                  <div className="vote-buttons">
                    <button
                      onClick={() => handleVote(meme._id, 'up')}
                      className={`vote-button upvote-button ${meme.votedUsers?.some(v => v.userId === currentUser._id && v.voteType === 'up') ? 'voted' : ''}`}
                    >
                      ⬆️ Upvote
                    </button>
                    <button
                      onClick={() => handleVote(meme._id, 'down')}
                      className={`vote-button downvote-button ${meme.votedUsers?.some(v => v.userId === currentUser._id && v.voteType === 'down') ? 'voted' : ''}`}
                    >
                      ⬇️ Downvote
                    </button>
                    <button onClick={() => handleCaption(meme._id)} className="generate-caption-button">AI Re-Caption</button>
                    {/* Only allow owner to delete */}
                    {currentUser._id === meme.owner?._id && (
                        <button onClick={() => handleDelete(meme._id)} className="delete-button">Delete</button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="no-memes-message">No memes to display. Be the first to create one!</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default App;
