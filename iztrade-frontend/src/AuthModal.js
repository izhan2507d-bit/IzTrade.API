import React, { useState } from 'react';
import axios from 'axios';

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

        // Basic Validation Check
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
            // 5 second timeout added so it never freezes infinitely
            const response = await axios.post(`http://localhost:5032/api/Auth/${endpoint}`, {
                email: email,
                password: password
            }, { timeout: 5000 });

            if (response.data && response.data.user) {
                setSuccessMessage(isRegister ? 'Account created! Logging in...' : 'Login successful!');
                setTimeout(() => {
                    localStorage.setItem('user', JSON.stringify(response.data.user));
                    onLoginSuccess(response.data.user);
                }, 800);
            }
        } catch (err) {
            console.error("Auth Error:", err);
            if (err.code === 'ECONNABORTED' || !err.response) {
                setErrorMessage('Backend server offline or not responding. Continuing as Guest?');
            } else if (err.response && err.response.data) {
                setErrorMessage(typeof err.response.data === 'string' ? err.response.data : 'Authentication failed.');
            } else {
                setErrorMessage('Error connecting to backend.');
            }
        } finally {
            setLoading(false); // Guarantees button resets back from "Processing..."
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
                width: '400px', border: '1px solid #2b313a', color: '#fff',
                boxShadow: '0px 12px 32px rgba(0, 0, 0, 0.6)'
            }}>
                {/* Header Title & Close Button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '12px', height: '12px', backgroundColor: '#f0b90b', borderRadius: '2px' }}></div>
                        <span style={{ fontWeight: 'bold', fontSize: '18px', letterSpacing: '0.5px' }}>IzTrade Pro</span>
                    </div>

                    {/* Fixed explicit type="button" for Close */}
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

                    {/* Alerts */}
                    {errorMessage && (
                        <div style={{
                            backgroundColor: 'rgba(246, 70, 93, 0.1)', border: '1px solid #f6465d',
                            color: '#f6465d', padding: '10px 12px', borderRadius: '6px',
                            fontSize: '13px', marginBottom: '16px', textAlign: 'center'
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