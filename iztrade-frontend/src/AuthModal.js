import React, { useState } from 'react';
import axios from 'axios';

// Environment variable with Railway direct live backend URL fallback
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_API_URL || 'https://iztrade-production.up.railway.app';

function AuthModal({ onLoginSuccess, onClose }) {
    const [isRegister, setIsRegister] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMessage('');
        setSuccessMessage('');

        // Basic Email & Password Validation
        if (!email.includes('@') || !email.includes('.')) {
            setErrorMessage('Please enter a valid email address (e.g. name@gmail.com)');
            return;
        }

        if (isRegister && password !== confirmPassword) {
            setErrorMessage('Passwords do not match!');
            return;
        }

        setLoading(true);
        const endpoint = isRegister ? 'register' : 'login';

        try {
            const response = await axios.post(`${API_BASE_URL}/api/Auth/${endpoint}`, {
                email: email,
                password: password
            }, { 
                timeout: 15000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            // Universal user data extraction (handles multiple C# API response formats)
            let userData = null;
            if (response.data) {
                if (response.data.user) {
                    userData = response.data.user;
                } else if (response.data.id || response.data.Id || response.data.email || response.data.Email) {
                    userData = response.data;
                } else if (typeof response.data === 'object') {
                    userData = response.data;
                }
            }

            // Fallback object if backend sends non-standard response structure
            if (!userData) {
                userData = { id: 1, email: email, name: email.split('@')[0] };
            }

            setSuccessMessage(isRegister ? 'Account created! Logging in...' : 'Login successful!');
            
            setTimeout(() => {
                localStorage.setItem('user', JSON.stringify(userData));
                if (onLoginSuccess) {
                    onLoginSuccess(userData);
                }
            }, 600);

        } catch (err) {
            console.error("Auth System Error:", err);
            
            if (err.response) {
                // Server responded with an error status (400, 401, 500 etc.)
                const data = err.response.data;
                let msg = 'Authentication failed.';
                
                if (typeof data === 'string') {
                    msg = data;
                } else if (data && data.message) {
                    msg = data.message;
                } else if (data && data.title) {
                    msg = data.title;
                } else if (data && typeof data === 'object') {
                    msg = JSON.stringify(data);
                }
                
                setErrorMessage(msg);
            } else if (err.code === 'ECONNABORTED') {
                setErrorMessage('Connection timed out. Railway backend is waking up, please try again in 5 seconds.');
            } else {
                setErrorMessage('Network error or CORS issue. Please try again or use Guest Mode.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(11, 14, 17, 0.85)', backdropFilter: 'blur(5px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
            <div style={{
                backgroundColor: '#1e2329', padding: '32px 28px', borderRadius: '12px',
                width: '100%', maxWidth: '400px', border: '1px solid #2b313a', color: '#fff',
                boxShadow: '0px 12px 32px rgba(0, 0, 0, 0.6)', boxSizing: 'border-box'
            }}>
                {/* Header Title & Close Button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '12px', height: '12px', backgroundColor: '#f0b90b', borderRadius: '2px' }}></div>
                        <span style={{ fontWeight: 'bold', fontSize: '18px', letterSpacing: '0.5px' }}>IzTrade Pro</span>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none', color: '#848e9c',
                            fontSize: '22px', cursor: 'pointer', lineHeight: '1', padding: '4px'
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Tab Switcher */}
                <div style={{
                    display: 'flex', backgroundColor: '#0b0e11', borderRadius: '6px',
                    padding: '4px', marginBottom: '24px'
                }}>
                    <button
                        type="button"
                        onClick={() => { setIsRegister(false); setErrorMessage(''); setSuccessMessage(''); }}
                        style={{
                            flex: 1, padding: '10px 0', border: 'none', borderRadius: '4px',
                            fontWeight: '600', fontSize: '14px', cursor: 'pointer',
                            backgroundColor: !isRegister ? '#2b313a' : 'transparent',
                            color: !isRegister ? '#fff' : '#848e9c'
                        }}
                    >
                        Log In
                    </button>
                    <button
                        type="button"
                        onClick={() => { setIsRegister(true); setErrorMessage(''); setSuccessMessage(''); }}
                        style={{
                            flex: 1, padding: '10px 0', border: 'none', borderRadius: '4px',
                            fontWeight: '600', fontSize: '14px', cursor: 'pointer',
                            backgroundColor: isRegister ? '#2b313a' : 'transparent',
                            color: isRegister ? '#fff' : '#848e9c'
                        }}
                    >
                        Register
                    </button>
                </div>

                {/* Main Form */}
                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '12px', color: '#848e9c', display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                            Email Address
                        </label>
                        <input
                            type="email"
                            placeholder="izhan@gmail.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            style={{
                                width: '100%', padding: '12px 14px', backgroundColor: '#0b0e11',
                                border: '1px solid #474d57', color: '#fff', borderRadius: '6px',
                                fontSize: '14px', outline: 'none', boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: isRegister ? '16px' : '20px' }}>
                        <label style={{ fontSize: '12px', color: '#848e9c', display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                            Password
                        </label>
                        <input
                            type="password"
                            placeholder="Enter password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            style={{
                                width: '100%', padding: '12px 14px', backgroundColor: '#0b0e11',
                                border: '1px solid #474d57', color: '#fff', borderRadius: '6px',
                                fontSize: '14px', outline: 'none', boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    {isRegister && (
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ fontSize: '12px', color: '#848e9c', display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                                Confirm Password
                            </label>
                            <input
                                type="password"
                                placeholder="Confirm password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                style={{
                                    width: '100%', padding: '12px 14px', backgroundColor: '#0b0e11',
                                    border: '1px solid #474d57', color: '#fff', borderRadius: '6px',
                                    fontSize: '14px', outline: 'none', boxSizing: 'border-box'
                                }}
                            />
                        </div>
                    )}

                    {/* Alert Messages */}
                    {errorMessage && (
                        <div style={{
                            backgroundColor: 'rgba(246, 70, 93, 0.1)', border: '1px solid #f6465d',
                            color: '#f6465d', padding: '10px 12px', borderRadius: '6px',
                            fontSize: '13px', marginBottom: '16px', textAlign: 'center', wordBreak: 'break-word'
                        }}>
                            {errorMessage}
                        </div>
                    )}

                    {successMessage && (
                        <div style={{
                            backgroundColor: 'rgba(14, 203, 129, 0.1)', border: '1px solid #0ecb81',
                            color: '#0ecb81', padding: '10px 12px', borderRadius: '6px',
                            fontSize: '13px', marginBottom: '16px', textAlign: 'center'
                        }}>
                            {successMessage}
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: '100%', padding: '14px',
                            backgroundColor: '#f0b90b', color: '#0e1114', border: 'none',
                            borderRadius: '6px', fontWeight: 'bold', fontSize: '15px',
                            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1
                        }}
                    >
                        {loading ? 'Processing...' : (isRegister ? 'Create Account' : 'Log In')}
                    </button>
                </form>

                {/* Guest Mode Direct Option */}
                <div style={{ marginTop: '16px', textAlign: 'center' }}>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            width: '100%', padding: '10px', backgroundColor: '#2b313a',
                            color: '#eaecef', border: 'none', borderRadius: '6px',
                            fontSize: '13px', cursor: 'pointer', fontWeight: '500'
                        }}
                    >
                        Continue as Guest Mode
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AuthModal;
