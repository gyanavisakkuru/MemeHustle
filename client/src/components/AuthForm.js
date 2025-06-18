// src/components/AuthForm.js
import React, { useState } from 'react';
import axios from 'axios';

// This component handles both login and signup
function AuthForm({ onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true); // Toggle between login and signup
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(''); // For displaying success/error messages

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(''); // Clear previous messages

    const url = isLogin ? '/api/auth/login' : '/api/auth/register';
    const action = isLogin ? 'Login' : 'Register';

    try {
      const response = await axios.post(url, { username, password });
      const { token, _id, username: returnedUsername } = response.data;

      // On successful authentication, call the prop function to update App.js state
      onAuthSuccess({ token, _id, username: returnedUsername });
      setMessage(`${action} successful! Welcome, ${returnedUsername}.`);
      setUsername('');
      setPassword('');
    } catch (err) {
      console.error(`${action} error:`, err.response?.data?.message || err.message);
      setMessage(`Failed to ${action.toLowerCase()}: ${err.response?.data?.message || 'Server error.'}`);
    }
  };

  return (
    <div className="auth-container">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h2>{isLogin ? 'Login to MemeHustle' : 'Register for MemeHustle'}</h2>
        {message && <p className="auth-message">{message}</p>}
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit">{isLogin ? 'Login' : 'Register'}</button>
        <p className="toggle-auth">
          {isLogin ? "Don't have an account?" : "Already have an account?"}
          <span onClick={() => setIsLogin(!isLogin)} className="toggle-link">
            {isLogin ? ' Register here.' : ' Login here.'}
          </span>
        </p>
      </form>
    </div>
  );
}

export default AuthForm;
