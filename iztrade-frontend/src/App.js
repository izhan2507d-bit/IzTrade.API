import React, { useEffect, useState, useCallback } from 'react';
import * as signalR from '@microsoft/signalr';
import axios from 'axios';
import AuthModal from './AuthModal';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_API_URL || 'https://iztrade-production.up.railway.app';

const Logo = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
        <svg width="26" height="26" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="100" height="100" rx="22" fill="#1E2329" />
            <rect x="22" y="20" width="14" height="60" rx="3" fill="#F0B90B" />
            <path d="M 30 20 L 78 20 L 78 32 L 52 32 Z" fill="#F0B90B" />
            <path d="M 78 20 L 40 80 L 28 80 L 66 20 Z" fill="#FFFFFF" />
            <path d="M 32 68 L 78 68 L 78 80 L 32 80 Z" fill="#F0B90B" />
        </svg>

        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1' }}>
            <span style={{ fontSize: '15px', fontWeight: '900', color: '#FFFFFF', letterSpacing: '0.5px' }}>
                IZ<span style={{ color: '#F0B90B' }}>TRADE</span>
            </span>
            <span style={{ fontSize: '7px', color: '#848E9C', fontWeight: 'bold', letterSpacing: '1px', marginTop: '2px' }}>
                PRO TERMINAL
            </span>
        </div>
    </div>
);

function App() {
    // Auth States
    const [currentUser, setCurrentUser] = useState(() => {
        const savedUser = localStorage.getItem('user');
        return savedUser ? JSON.parse(savedUser) : null;
    });
    const [showAuthModal, setShowAuthModal] = useState(false);

    // Trading States
    const [symbol] = useState('BTCUSDT');
    const [price, setPrice] = useState('50000');
    const [quantity, setQuantity] = useState('0.1');
    const [orderType, setOrderType] = useState('BUY');
    const [orderBook, setOrderBook] = useState({ bids: [], asks: [] });
    const [statusMsg, setStatusMsg] = useState('');

    // Wallet States
    const [wallets, setWallets] = useState([]);
    const [adminCommissions, setAdminCommissions] = useState([]);
    const [depositAmount, setDepositAmount] = useState('');
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [activeModal, setActiveModal] = useState(null);

    // Navigation & Mobile Navigation
    const [activeMobileTab, setActiveMobileTab] = useState('chart');
    const [withdrawMethod, setWithdrawMethod] = useState('JAZZCASH');
    const [accountTitle, setAccountTitle] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [bankName, setBankName] = useState('');

    // Screen Responsiveness
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Helper to extract valid integer UserId safely
    const getValidUserId = useCallback(() => {
        if (!currentUser) return null;
        const rawUserId = currentUser.id || currentUser.userId || currentUser.UserDTO?.id || currentUser.user?.id || currentUser.Id;
        const parsed = parseInt(rawUserId, 10);
        return (!isNaN(parsed) && parsed > 0) ? parsed : null;
    }, [currentUser]);

    const getItemQty = (item) => {
        if (!item) return 0;
        if (typeof item === 'number') return item;
        const val = item.quantity ?? item.Quantity ?? item.amount ?? item.Amount ?? item.size ?? item.Size ?? item.remainingQuantity ?? item.origQty ?? item.qty ?? item.Qty ?? 0;
        const parsed = parseFloat(val);
        return isNaN(parsed) ? 0 : parsed;
    };

    const getItemPrice = (item) => {
        if (!item) return 0;
        if (typeof item === 'number') return item > 200000 ? item / 10 : item;
        const val = item.price ?? item.Price ?? item.p ?? 0;
        let parsed = parseFloat(val);
        if (isNaN(parsed)) return 0;
        if (parsed > 200000) parsed = parsed / 10;
        return parsed;
    };

    const fetchUserData = useCallback(async () => {
        const userId = getValidUserId();
        if (!userId) return;

        try {
            const walletRes = await axios.get(`${API_BASE_URL}/api/Wallet/user/${userId}`);
            if (walletRes.data) setWallets(walletRes.data);

            const adminRes = await axios.get(`${API_BASE_URL}/api/Wallet/admin/commissions`);
            if (adminRes.data) setAdminCommissions(adminRes.data);
        } catch (err) {
            console.error("Wallet Fetch Error:", err);
        }
    }, [getValidUserId]);

    const fetchOrderBook = useCallback(async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/Order/orderbook/${symbol}`);
            if (res.data) {
                setOrderBook({
                    bids: res.data.bids || res.data.Bids || [],
                    asks: res.data.asks || res.data.Asks || []
                });
            }
        } catch (err) {
            console.error("OrderBook fetch error:", err);
        }
    }, [symbol]);

    useEffect(() => {
        fetchOrderBook();
        if (currentUser) fetchUserData();
    }, [currentUser, fetchOrderBook, fetchUserData]);

    useEffect(() => {
        let isMounted = true;
        const connection = new signalR.HubConnectionBuilder()
            .withUrl(`${API_BASE_URL}/hubs/market`, {
                skipNegotiation: false,
                transport: signalR.HttpTransportType.WebSockets
            })
            .withAutomaticReconnect()
            .build();

        connection.start()
            .then(() => {
                if (!isMounted) {
                    connection.stop();
                    return;
                }
                connection.on("ReceiveTrade", (tradeSymbol) => {
                    if (tradeSymbol === symbol) {
                        fetchOrderBook();
                        if (currentUser) fetchUserData();
                    }
                });
            })
            .catch(err => {
                if (isMounted) console.error("SignalR Error: ", err);
            });

        return () => {
            isMounted = false;
            if (connection.state === signalR.HubConnectionState.Connected) connection.stop();
        };
    }, [symbol, fetchOrderBook, fetchUserData, currentUser]);

    const handleLogout = () => {
        localStorage.removeItem('user');
        setCurrentUser(null);
        setWallets([]);
        setStatusMsg('');
    };

    // UPDATED ORDER PLACEMENT HANDLER (WITH DTO WRAPPER)
    const handlePlaceOrder = async (e) => {
        e.preventDefault();
        if (!currentUser) {
            setShowAuthModal(true);
            return;
        }

        setStatusMsg('Processing Order...');

        const userId = getValidUserId();
        if (!userId) {
            setStatusMsg('Error: Invalid session. Please Logout and Login again.');
            return;
        }

        const parsedPrice = parseFloat(price);
        const parsedQuantity = parseFloat(quantity);

        if (isNaN(parsedPrice) || parsedPrice <= 0 || isNaN(parsedQuantity) || parsedQuantity <= 0) {
            setStatusMsg('Error: Enter valid price & quantity');
            return;
        }

        // Direct object with strictly parsed Integer userId
        const payload = {
            userId: Number(userId),
            symbol: String(symbol || "BTCUSDT"),
            price: parsedPrice,
            quantity: parsedQuantity,
            orderType: String(orderType).toUpperCase(),
            status: "PENDING"
        };

        try {
            // Wrap inside 'dto' object so ASP.NET model binder maps it correctly
            const response = await axios.post(`${API_BASE_URL}/api/Order/place`, { dto: payload }, {
                headers: { 
                    'Content-Type': 'application/json' 
                }
            });

            setStatusMsg(response.data?.message || 'Order placed successfully!');
            fetchUserData();
            fetchOrderBook();
        } catch (error) {
            console.error("Order Place Error:", error);
            const errorData = error.response?.data;
            let errorMsg = 'Failed to place order';
            if (typeof errorData === 'string') errorMsg = errorData;
            else if (errorData?.errors) errorMsg = Object.values(errorData.errors).flat().join(', ');
            else if (errorData?.message) errorMsg = errorData.message;
            else if (errorData?.title) errorMsg = errorData.title;

            setStatusMsg(`Error: ${errorMsg}`);
        }
    };

    const handleDeposit = async (e) => {
        e.preventDefault();
        const userId = getValidUserId();
        if (!userId) return;

        try {
            const res = await axios.post(`${API_BASE_URL}/api/Wallet/deposit`, {
                userId: userId,
                currency: 'USDT',
                amount: parseFloat(depositAmount)
            });
            alert(res.data.message || 'Deposit successful!');
            setDepositAmount('');
            setActiveModal(null);
            fetchUserData();
        } catch (err) {
            alert(err.response?.data?.message || err.response?.data || 'Deposit failed');
        }
    };

    const handleWithdraw = async (e) => {
        e.preventDefault();
        const userId = getValidUserId();
        if (!userId) return;

        try {
            const res = await axios.post(`${API_BASE_URL}/api/Wallet/withdraw`, {
                userId: userId,
                currency: 'USDT',
                amount: parseFloat(withdrawAmount),
                method: withdrawMethod,
                accountTitle: accountTitle,
                accountNumber: accountNumber,
                bankName: withdrawMethod === 'BANK' ? bankName : undefined
            });
            alert(res.data.message || `Withdrawal request submitted via ${withdrawMethod}`);
            setWithdrawAmount('');
            setAccountTitle('');
            setAccountNumber('');
            setBankName('');
            setActiveModal(null);
            fetchUserData();
        } catch (err) {
            alert(err.response?.data?.message || err.response?.data || 'Withdrawal failed');
        }
    };

    const usdtWallet = wallets.find(w => w.currency === 'USDT' || w.Currency === 'USDT') || { balance: 0, Balance: 0 };
    const btcWallet = wallets.find(w => w.currency === 'BTC' || w.Currency === 'BTC') || { balance: 0, Balance: 0 };
    const adminUsdt = adminCommissions.find(a => a.currency === 'USDT' || a.Currency === 'USDT') || { totalCommissionEarned: 0, TotalCommissionEarned: 0 };

    const getUsdtVal = () => (usdtWallet.balance !== undefined ? usdtWallet.balance : usdtWallet.Balance) || 0;
    const getBtcVal = () => (btcWallet.balance !== undefined ? btcWallet.balance : btcWallet.Balance) || 0;
    const getAdminVal = () => (adminUsdt.totalCommissionEarned !== undefined ? adminUsdt.totalCommissionEarned : adminUsdt.TotalCommissionEarned) || 0;

    const handlePercentageClick = (percent) => {
        if (orderType === 'BUY') {
            const usdtBalance = getUsdtVal();
            if (usdtBalance > 0 && parseFloat(price) > 0) {
                setQuantity(((usdtBalance * (percent / 100)) / parseFloat(price)).toFixed(4));
            }
        } else {
            const btcBalance = getBtcVal();
            if (btcBalance > 0) {
                setQuantity((btcBalance * (percent / 100)).toFixed(4));
            }
        }
    };

    const topBidRaw = orderBook.bids.length > 0 ? getItemPrice(orderBook.bids[0]) : 83860.01;
    const currentDisplayPrice = topBidRaw > 0 ? topBidRaw : 83860.01;

    const inputStyle = {
        width: '100%',
        padding: '10px',
        backgroundColor: '#2b313a',
        border: '1px solid #474d57',
        color: '#fff',
        borderRadius: '6px',
        marginBottom: '10px',
        boxSizing: 'border-box',
        fontSize: '13px'
    };

    return (
        <div style={{ backgroundColor: '#0b0e11', color: '#eaecef', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', fontSize: '12px', overflowX: 'hidden' }}>

            {/* Top Navigation Bar */}
            <header style={{
                backgroundColor: '#181a20',
                borderBottom: '1px solid #2b313a',
                padding: '8px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxSizing: 'border-box'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Logo />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#fff' }}>BTC/USDT</span>
                        <span style={{ color: '#0ecb81', fontWeight: 'bold', fontSize: '11px' }}>
                            ${currentDisplayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {currentUser ? (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <button onClick={() => setActiveModal('DEPOSIT')} style={{ padding: '6px 10px', backgroundColor: '#0ecb81', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>Deposit</button>
                            <button onClick={() => setActiveModal('WITHDRAW')} style={{ padding: '6px 10px', backgroundColor: '#f6465d', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>Withdraw</button>
                            {!isMobile && <button onClick={() => setActiveModal('ADMIN')} style={{ padding: '6px 10px', backgroundColor: '#f0b90b', border: 'none', borderRadius: '4px', color: '#000', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>Profit</button>}
                            <button onClick={handleLogout} style={{ padding: '6px 10px', backgroundColor: '#2b313a', border: 'none', borderRadius: '4px', color: '#848e9c', cursor: 'pointer', fontSize: '11px' }}>Logout</button>
                        </div>
                    ) : (
                        <button onClick={() => setShowAuthModal(true)} style={{ padding: '6px 12px', backgroundColor: '#f0b90b', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '11px' }}>
                            Log In
                        </button>
                    )}
                </div>
            </header>

            {/* Mobile Tab Header */}
            {isMobile && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', backgroundColor: '#181a20', borderBottom: '1px solid #2b313a', textAlign: 'center' }}>
                    <button onClick={() => setActiveMobileTab('chart')} style={{ padding: '10px', background: 'transparent', border: 'none', color: activeMobileTab === 'chart' ? '#f0b90b' : '#848e9c', borderBottom: activeMobileTab === 'chart' ? '2px solid #f0b90b' : 'none', fontWeight: 'bold', fontSize: '12px' }}>Chart</button>
                    <button onClick={() => setActiveMobileTab('book')} style={{ padding: '10px', background: 'transparent', border: 'none', color: activeMobileTab === 'book' ? '#f0b90b' : '#848e9c', borderBottom: activeMobileTab === 'book' ? '2px solid #f0b90b' : 'none', fontWeight: 'bold', fontSize: '12px' }}>Order Book</button>
                    <button onClick={() => setActiveMobileTab('trade')} style={{ padding: '10px', background: 'transparent', border: 'none', color: activeMobileTab === 'trade' ? '#f0b90b' : '#848e9c', borderBottom: activeMobileTab === 'trade' ? '2px solid #f0b90b' : 'none', fontWeight: 'bold', fontSize: '12px' }}>Trade</button>
                </div>
            )}

            {/* Main Trading Area */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 300px 300px',
                height: isMobile ? 'calc(100vh - 150px)' : 'calc(100vh - 56px)',
                backgroundColor: '#1e2329'
            }}>

                {/* Left Chart Panel */}
                {(!isMobile || activeMobileTab === 'chart') && (
                    <div style={{ backgroundColor: '#181a20', display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <iframe
                            title="TradingView Chart"
                            src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_1&symbol=BINANCE%3A${symbol}&interval=1&hidesidetoolbar=0&symboledit=1&theme=dark`}
                            width="100%"
                            height="100%"
                            style={{ border: 'none' }}
                        ></iframe>
                    </div>
                )}

                {/* Center Order Book Panel */}
                {(!isMobile || activeMobileTab === 'book') && (
                    <div style={{ backgroundColor: '#181a20', display: 'flex', flexDirection: 'column', borderLeft: isMobile ? 'none' : '1px solid #2b313a', borderRight: isMobile ? 'none' : '1px solid #2b313a', height: '100%' }}>
                        <div style={{ padding: '8px 12px', borderBottom: '1px solid #2b313a', fontWeight: 'bold', color: '#eaecef' }}>Order Book</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '6px 12px', fontSize: '11px', color: '#848e9c', borderBottom: '1px solid #2b313a' }}>
                            <span>Price (USDT)</span>
                            <span style={{ textAlign: 'right' }}>Size (BTC)</span>
                        </div>

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                                {orderBook.asks.slice(-8).reverse().map((ask, i) => (
                                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '3px 12px', color: '#f6465d', fontSize: '11px' }}>
                                        <span>{getItemPrice(ask).toFixed(2)}</span>
                                        <span style={{ textAlign: 'right', color: '#eaecef' }}>{getItemQty(ask).toFixed(4)}</span>
                                    </div>
                                ))}
                            </div>

                            <div style={{ padding: '6px 12px', backgroundColor: '#0b0e11', borderTop: '1px solid #2b313a', borderBottom: '1px solid #2b313a', display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#0ecb81', fontSize: '13px', fontWeight: 'bold' }}>{currentDisplayPrice.toFixed(2)} ↑</span>
                            </div>

                            <div style={{ flex: 1 }}>
                                {orderBook.bids.slice(0, 8).map((bid, i) => (
                                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '3px 12px', color: '#0ecb81', fontSize: '11px' }}>
                                        <span>{getItemPrice(bid).toFixed(2)}</span>
                                        <span style={{ textAlign: 'right', color: '#eaecef' }}>{getItemQty(bid).toFixed(4)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Right Trade Form Panel */}
                {(!isMobile || activeMobileTab === 'trade') && (
                    <div style={{ backgroundColor: '#181a20', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', backgroundColor: '#0b0e11', padding: '4px', borderRadius: '6px' }}>
                            <button type="button" onClick={() => setOrderType('BUY')} style={{ padding: '10px', backgroundColor: orderType === 'BUY' ? '#0ecb81' : 'transparent', color: orderType === 'BUY' ? '#fff' : '#848e9c', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>BUY</button>
                            <button type="button" onClick={() => setOrderType('SELL')} style={{ padding: '10px', backgroundColor: orderType === 'SELL' ? '#f6465d' : 'transparent', color: orderType === 'SELL' ? '#fff' : '#848e9c', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>SELL</button>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#848e9c', fontSize: '12px' }}>
                            <span>Avail Balance:</span>
                            <span style={{ color: '#eaecef', fontWeight: 'bold' }}>
                                {orderType === 'BUY' ? `${Number(getUsdtVal()).toFixed(2)} USDT` : `${Number(getBtcVal()).toFixed(4)} BTC`}
                            </span>
                        </div>

                        <form onSubmit={handlePlaceOrder} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div>
                                <span style={{ color: '#848e9c', fontSize: '11px' }}>Price (USDT)</span>
                                <input type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} style={{ ...inputStyle, marginBottom: 0, marginTop: '4px' }} />
                            </div>
                            <div>
                                <span style={{ color: '#848e9c', fontSize: '11px' }}>Quantity (BTC)</span>
                                <input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ ...inputStyle, marginBottom: 0, marginTop: '4px' }} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                                {[25, 50, 75, 100].map((percent) => (
                                    <button key={percent} type="button" onClick={() => handlePercentageClick(percent)} style={{ backgroundColor: '#2b313a', border: 'none', color: '#848e9c', padding: '6px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>{percent}%</button>
                                ))}
                            </div>

                            <button type="submit" style={{ width: '100%', padding: '12px', backgroundColor: orderType === 'BUY' ? '#0ecb81' : '#f6465d', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', marginTop: '6px' }}>
                                {orderType} BTC
                            </button>
                        </form>

                        {statusMsg && <div style={{ padding: '10px', backgroundColor: '#2b313a', borderRadius: '6px', color: '#f0b90b', textAlign: 'center' }}>{statusMsg}</div>}
                    </div>
                )}
            </div>

            {/* Mobile Bottom Quick Action Bar */}
            {isMobile && activeMobileTab !== 'trade' && (
                <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#181a20', borderTop: '1px solid #2b313a', padding: '8px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', zIndex: 99 }}>
                    <button onClick={() => { setOrderType('BUY'); setActiveMobileTab('trade'); }} style={{ padding: '12px', backgroundColor: '#0ecb81', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '14px' }}>BUY BTC</button>
                    <button onClick={() => { setOrderType('SELL'); setActiveMobileTab('trade'); }} style={{ padding: '12px', backgroundColor: '#f6465d', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '14px' }}>SELL BTC</button>
                </div>
            )}

            {/* Modals */}
            {activeModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '16px' }}>
                    <div style={{ backgroundColor: '#181a20', padding: '20px', borderRadius: '12px', width: '100%', maxWidth: '380px', border: '1px solid #2b313a', position: 'relative' }}>
                        <button onClick={() => setActiveModal(null)} style={{ position: 'absolute', top: '12px', right: '12px', background: 'transparent', border: 'none', color: '#848e9c', fontSize: '18px', cursor: 'pointer' }}>✕</button>

                        {activeModal === 'DEPOSIT' && (
                            <form onSubmit={handleDeposit}>
                                <h3 style={{ marginTop: 0, color: '#0ecb81' }}>Deposit USDT</h3>
                                <input type="number" step="any" placeholder="Amount" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} required style={inputStyle} />
                                <button type="submit" style={{ width: '100%', padding: '12px', backgroundColor: '#0ecb81', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Confirm Deposit</button>
                            </form>
                        )}

                        {activeModal === 'WITHDRAW' && (
                            <form onSubmit={handleWithdraw}>
                                <h3 style={{ marginTop: 0, color: '#f6465d' }}>Withdraw USDT</h3>
                                <select value={withdrawMethod} onChange={(e) => setWithdrawMethod(e.target.value)} style={inputStyle}>
                                    <option value="JAZZCASH">JazzCash (P2P)</option>
                                    <option value="EASYPAISA">EasyPaisa (P2P)</option>
                                    <option value="BANK">Local Bank Transfer</option>
                                </select>
                                <input type="number" step="any" placeholder="Amount (USDT)" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} required style={inputStyle} />
                                <input type="text" placeholder="Account Title" value={accountTitle} onChange={(e) => setAccountTitle(e.target.value)} required style={inputStyle} />
                                <input type="text" placeholder="Account Number / Mobile Number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} required style={inputStyle} />
                                {withdrawMethod === 'BANK' && (
                                    <input type="text" placeholder="Bank Name" value={bankName} onChange={(e) => setBankName(e.target.value)} required style={inputStyle} />
                                )}
                                <button type="submit" style={{ width: '100%', padding: '12px', backgroundColor: '#f6465d', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Confirm Withdrawal</button>
                            </form>
                        )}

                        {activeModal === 'ADMIN' && (
                            <div style={{ textAlign: 'center' }}>
                                <h3 style={{ color: '#f0b90b' }}>Owner Profit</h3>
                                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0ecb81', margin: '20px 0' }}>${Number(getAdminVal()).toFixed(2)}</div>
                                <button onClick={() => setActiveModal(null)} style={{ width: '100%', padding: '10px', backgroundColor: '#2b313a', color: '#fff', border: 'none', borderRadius: '6px' }}>Close</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showAuthModal && (
                <AuthModal onClose={() => setShowAuthModal(false)} onLoginSuccess={(user) => { setCurrentUser(user); localStorage.setItem('user', JSON.stringify(user)); setShowAuthModal(false); }} />
            )}
        </div>
    );
}

export default App;
