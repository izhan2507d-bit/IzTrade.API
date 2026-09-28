import React, { useEffect, useState, useCallback } from 'react';
import * as signalR from '@microsoft/signalr';
import axios from 'axios';
import AuthModal from './AuthModal';

// Modern Geometric Overlapping IZ Logo Component
const Logo = () => {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <svg width="34" height="34" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="100" height="100" rx="22" fill="#1E2329" />
                <rect x="22" y="20" width="14" height="60" rx="3" fill="#F0B90B" />
                <path d="M 30 20 L 78 20 L 78 32 L 52 32 Z" fill="#F0B90B" />
                <path d="M 78 20 L 40 80 L 28 80 L 66 20 Z" fill="#FFFFFF" />
                <path d="M 32 68 L 78 68 L 78 80 L 32 80 Z" fill="#F0B90B" />
            </svg>

            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1' }}>
                <span style={{ fontSize: '18px', fontWeight: '900', color: '#FFFFFF', letterSpacing: '0.5px' }}>
                    IZ<span style={{ color: '#F0B90B' }}>TRADE</span>
                </span>
                <span style={{ fontSize: '8px', color: '#848E9C', fontWeight: 'bold', letterSpacing: '1.5px', marginTop: '2px' }}>
                    PRO TERMINAL
                </span>
            </div>
        </div>
    );
};

function App() {
    // Authentication States
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

    // Wallet & Banking States
    const [wallets, setWallets] = useState([]);
    const [adminCommissions, setAdminCommissions] = useState([]);
    const [depositAmount, setDepositAmount] = useState('');
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [activeModal, setActiveModal] = useState(null);

    // P2P / Local Withdrawal Options
    const [withdrawMethod, setWithdrawMethod] = useState('JAZZCASH');
    const [accountTitle, setAccountTitle] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [bankName, setBankName] = useState('');

    // Flexible extraction helper for Quantity / Size
    const getItemQty = (item) => {
        if (!item) return 0;
        if (typeof item === 'number') return item;
        const val = item.quantity ?? item.Quantity ?? item.amount ?? item.Amount ?? item.size ?? item.Size ?? item.remainingQuantity ?? item.origQty ?? item.qty ?? item.Qty ?? 0;
        const parsed = parseFloat(val);
        return isNaN(parsed) ? 0 : parsed;
    };

    // Flexible extraction helper for Price (With Auto Scaling Fix)
    const getItemPrice = (item) => {
        if (!item) return 0;
        if (typeof item === 'number') return item > 200000 ? item / 10 : item;
        const val = item.price ?? item.Price ?? item.p ?? 0;
        let parsed = parseFloat(val);
        if (isNaN(parsed)) return 0;
        if (parsed > 200000) parsed = parsed / 10;
        return parsed;
    };

    // Fetch Wallets Data
    const fetchUserData = useCallback(async () => {
        if (!currentUser) return;
        try {
            const walletRes = await axios.get(`http://localhost:5032/api/Wallet/user/${currentUser.id}`);
            if (walletRes.data) setWallets(walletRes.data);

            const adminRes = await axios.get('http://localhost:5032/api/Wallet/admin/commissions');
            if (adminRes.data) setAdminCommissions(adminRes.data);
        } catch (err) {
            console.error("Wallet Fetch Error:", err);
        }
    }, [currentUser]);

    const fetchOrderBook = useCallback(async () => {
        try {
            const res = await axios.get(`http://localhost:5032/api/Order/orderbook/${symbol}`);
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
        if (currentUser) {
            fetchUserData();
        }
    }, [currentUser, fetchOrderBook, fetchUserData]);

    useEffect(() => {
        let isMounted = true;

        const connection = new signalR.HubConnectionBuilder()
            .withUrl("http://localhost:5032/hubs/market", {
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
                if (isMounted) console.error("SignalR Connection Error: ", err);
            });

        return () => {
            isMounted = false;
            if (connection.state === signalR.HubConnectionState.Connected) {
                connection.stop();
            }
        };
    }, [symbol, fetchOrderBook, fetchUserData, currentUser]);

    const handleLogout = () => {
        localStorage.removeItem('user');
        setCurrentUser(null);
        setWallets([]);
    };

    const handlePlaceOrder = async (e) => {
        e.preventDefault();
        if (!currentUser) {
            setShowAuthModal(true);
            return;
        }

        setStatusMsg('Processing Order...');

        try {
            const response = await axios.post('http://localhost:5032/api/Order/place', {
                userId: parseInt(currentUser.id, 10),
                symbol: symbol || "BTCUSDT",
                price: parseFloat(price),
                quantity: parseFloat(quantity),
                orderType: orderType
            });

            setStatusMsg(response.data?.message || 'Order placed successfully!');
            fetchUserData();
            fetchOrderBook();
        } catch (error) {
            if (error.response && error.response.data) {
                const errorMsg = typeof error.response.data === 'string'
                    ? error.response.data
                    : (error.response.data.title || JSON.stringify(error.response.data));
                setStatusMsg(`Error: ${errorMsg}`);
            } else {
                setStatusMsg('Failed to place order.');
            }
        }
    };

    const handleDeposit = async (e) => {
        e.preventDefault();
        if (!currentUser) return;
        try {
            const res = await axios.post('http://localhost:5032/api/Wallet/deposit', {
                userId: currentUser.id,
                currency: 'USDT',
                amount: parseFloat(depositAmount)
            });
            alert(res.data.message || 'Deposit successful!');
            setDepositAmount('');
            setActiveModal(null);
            fetchUserData();
        } catch (err) {
            alert(err.response?.data || 'Deposit failed');
        }
    };

    const handleWithdraw = async (e) => {
        e.preventDefault();
        if (!currentUser) return;
        try {
            const res = await axios.post('http://localhost:5032/api/Wallet/withdraw', {
                userId: currentUser.id,
                currency: 'USDT',
                amount: parseFloat(withdrawAmount),
                method: withdrawMethod,
                accountTitle: accountTitle,
                accountNumber: accountNumber,
                bankName: bankName
            });
            alert(res.data.message || `Withdrawal request submitted via ${withdrawMethod}`);
            setWithdrawAmount('');
            setAccountTitle('');
            setAccountNumber('');
            setBankName('');
            setActiveModal(null);
            fetchUserData();
        } catch (err) {
            alert(err.response?.data || 'Withdrawal failed');
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

    // Calculate Top Bid Price correctly
    const topBidRaw = orderBook.bids.length > 0 ? getItemPrice(orderBook.bids[0]) : 83860.01;
    const currentDisplayPrice = topBidRaw > 0 ? topBidRaw : 83860.01;

    return (
        <div style={{ backgroundColor: '#0b0e11', color: '#eaecef', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', fontSize: '12px' }}>

            {/* Top Header */}
            <header style={{ backgroundColor: '#181a20', borderBottom: '1px solid #2b313a', padding: '0 16px', height: '56px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <Logo />
                    <div style={{ height: '24px', width: '1px', backgroundColor: '#2b313a' }}></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>BTC/USDT</span>
                        <span style={{ color: '#0ecb81', fontWeight: 'bold', fontSize: '13px' }}>
                            ${currentDisplayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span style={{ color: '#848e9c', fontSize: '11px' }}>24h Vol: <strong style={{ color: '#eaecef' }}>14,295.40 BTC</strong></span>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    {currentUser ? (
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', backgroundColor: '#1e2329', padding: '4px 12px', borderRadius: '4px', border: '1px solid #2b313a' }}>
                            <span style={{ color: '#f0b90b', fontSize: '12px' }}>👤 {currentUser.email}</span>
                            <div style={{ height: '14px', width: '1px', backgroundColor: '#2b313a' }}></div>
                            <span>USDT: <strong style={{ color: '#0ecb81' }}>{Number(getUsdtVal()).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                            <span>BTC: <strong style={{ color: '#f0b90b' }}>{Number(getBtcVal()).toFixed(4)}</strong></span>

                            <button onClick={() => setActiveModal('DEPOSIT')} style={{ padding: '4px 10px', backgroundColor: '#0ecb81', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>Deposit</button>
                            <button onClick={() => setActiveModal('WITHDRAW')} style={{ padding: '4px 10px', backgroundColor: '#f6465d', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>Withdraw</button>
                            <button onClick={() => setActiveModal('ADMIN')} style={{ padding: '4px 10px', backgroundColor: '#f0b90b', border: 'none', borderRadius: '4px', color: '#000', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>Owner Profit</button>
                            <button onClick={handleLogout} style={{ padding: '4px 10px', backgroundColor: '#2b313a', border: 'none', borderRadius: '4px', color: '#848e9c', cursor: 'pointer', fontSize: '11px' }}>Logout</button>
                        </div>
                    ) : (
                        <button onClick={() => setShowAuthModal(true)} style={{ padding: '6px 16px', backgroundColor: '#f0b90b', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>
                            Log In / Register
                        </button>
                    )}
                </div>
            </header>

            {/* Trading Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px 300px', height: 'calc(100vh - 56px)', gap: '1px', backgroundColor: '#1e2329' }}>

                {/* Left Chart */}
                <div style={{ backgroundColor: '#181a20', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '8px 16px', borderBottom: '1px solid #2b313a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#848e9c', fontWeight: '500' }}>TradingView Chart</span>
                        <div style={{ display: 'flex', gap: '8px', color: '#848e9c', fontSize: '11px' }}>
                            <span style={{ color: '#f0b90b', cursor: 'pointer' }}>1m</span>
                            <span style={{ cursor: 'pointer' }}>15m</span>
                            <span style={{ cursor: 'pointer' }}>1h</span>
                            <span style={{ cursor: 'pointer' }}>4h</span>
                            <span style={{ cursor: 'pointer' }}>1D</span>
                        </div>
                    </div>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <iframe
                            title="TradingView Chart"
                            src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_1&symbol=BINANCE%3A${symbol}&interval=1&hidesidetoolbar=0&symboledit=1&theme=dark`}
                            width="100%"
                            height="100%"
                            style={{ border: 'none', position: 'absolute', top: 0, left: 0 }}
                        ></iframe>
                    </div>
                </div>

                {/* Middle Orderbook */}
                <div style={{ backgroundColor: '#181a20', display: 'flex', flexDirection: 'column', borderLeft: '1px solid #2b313a', borderRight: '1px solid #2b313a' }}>
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid #2b313a', fontWeight: 'bold', color: '#eaecef' }}>Order Book</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '6px 12px', fontSize: '11px', color: '#848e9c', borderBottom: '1px solid #2b313a' }}>
                        <span>Price (USDT)</span>
                        <span style={{ textAlign: 'right' }}>Size (BTC)</span>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                        {/* Asks */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '4px 0' }}>
                            {orderBook.asks.length === 0 ? (
                                <div style={{ color: '#5e6673', textAlign: 'center', padding: '12px' }}>No Sell Orders</div>
                            ) : (
                                orderBook.asks.slice(-12).reverse().map((ask, i) => (
                                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '2px 12px', color: '#f6465d', fontSize: '11px' }}>
                                        <span style={{ fontWeight: '500' }}>{getItemPrice(ask).toFixed(2)}</span>
                                        <span style={{ textAlign: 'right', color: '#eaecef' }}>{getItemQty(ask).toFixed(4)}</span>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Spread Indicator */}
                        <div style={{ padding: '8px 12px', backgroundColor: '#0b0e11', borderTop: '1px solid #2b313a', borderBottom: '1px solid #2b313a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#0ecb81', fontSize: '15px', fontWeight: 'bold' }}>{currentDisplayPrice.toFixed(2)} ↑</span>
                            <span style={{ color: '#848e9c', fontSize: '11px' }}>Spread: 0.01</span>
                        </div>

                        {/* Bids */}
                        <div style={{ flex: 1, padding: '4px 0' }}>
                            {orderBook.bids.length === 0 ? (
                                <div style={{ color: '#5e6673', textAlign: 'center', padding: '12px' }}>No Buy Orders</div>
                            ) : (
                                orderBook.bids.slice(0, 12).map((bid, i) => (
                                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '2px 12px', color: '#0ecb81', fontSize: '11px' }}>
                                        <span style={{ fontWeight: '500' }}>{getItemPrice(bid).toFixed(2)}</span>
                                        <span style={{ textAlign: 'right', color: '#eaecef' }}>{getItemQty(bid).toFixed(4)}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Form */}
                <div style={{ backgroundColor: '#181a20', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', backgroundColor: '#0b0e11', padding: '3px', borderRadius: '4px' }}>
                        <button type="button" onClick={() => setOrderType('BUY')} style={{ padding: '8px', backgroundColor: orderType === 'BUY' ? '#0ecb81' : 'transparent', color: orderType === 'BUY' ? '#fff' : '#848e9c', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>BUY</button>
                        <button type="button" onClick={() => setOrderType('SELL')} style={{ padding: '8px', backgroundColor: orderType === 'SELL' ? '#f6465d' : 'transparent', color: orderType === 'SELL' ? '#fff' : '#848e9c', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>SELL</button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#848e9c', fontSize: '11px' }}>
                        <span>Avail:</span>
                        <span style={{ color: '#eaecef', fontWeight: '500' }}>
                            {orderType === 'BUY' ? `${Number(getUsdtVal()).toFixed(2)} USDT` : `${Number(getBtcVal()).toFixed(4)} BTC`}
                        </span>
                    </div>

                    <form onSubmit={handlePlaceOrder} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                            <span style={{ color: '#848e9c', fontSize: '11px' }}>Price (USDT)</span>
                            <input type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#2b313a', border: '1px solid #474d57', color: '#fff', borderRadius: '4px', marginTop: '4px', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                            <span style={{ color: '#848e9c', fontSize: '11px' }}>Quantity (BTC)</span>
                            <input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#2b313a', border: '1px solid #474d57', color: '#fff', borderRadius: '4px', marginTop: '4px', boxSizing: 'border-box' }} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                            {[25, 50, 75, 100].map((percent) => (
                                <button key={percent} type="button" onClick={() => handlePercentageClick(percent)} style={{ backgroundColor: '#2b313a', border: 'none', color: '#848e9c', padding: '4px', borderRadius: '2px', cursor: 'pointer', fontSize: '10px' }}>{percent}%</button>
                            ))}
                        </div>

                        <button type="submit" style={{ width: '100%', padding: '10px', backgroundColor: orderType === 'BUY' ? '#0ecb81' : '#f6465d', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
                            {orderType} BTC
                        </button>
                    </form>

                    {statusMsg && <div style={{ padding: '8px', backgroundColor: '#2b313a', borderRadius: '4px', color: '#f0b90b', textAlign: 'center' }}>{statusMsg}</div>}
                </div>
            </div>

            {/* Modals */}
            {activeModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: '#181a20', padding: '20px', borderRadius: '8px', width: '380px', border: '1px solid #2b313a', position: 'relative' }}>
                        <button onClick={() => setActiveModal(null)} style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', color: '#848e9c', fontSize: '16px', cursor: 'pointer' }}>✕</button>

                        {activeModal === 'DEPOSIT' && (
                            <form onSubmit={handleDeposit}>
                                <h3 style={{ marginTop: 0, color: '#0ecb81' }}>Deposit USDT</h3>
                                <input type="number" step="any" placeholder="Amount" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} required style={{ width: '100%', padding: '10px', backgroundColor: '#2b313a', border: '1px solid #474d57', color: '#fff', borderRadius: '4px', marginBottom: '15px', boxSizing: 'border-box' }} />
                                <button type="submit" style={{ width: '100%', padding: '10px', backgroundColor: '#0ecb81', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Confirm Deposit</button>
                            </form>
                        )}

                        {activeModal === 'WITHDRAW' && (
                            <form onSubmit={handleWithdraw}>
                                <h3 style={{ marginTop: 0, color: '#f6465d' }}>Withdraw USDT</h3>
                                <select value={withdrawMethod} onChange={(e) => setWithdrawMethod(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#2b313a', border: '1px solid #474d57', color: '#fff', borderRadius: '4px', marginBottom: '10px', boxSizing: 'border-box' }}>
                                    <option value="JAZZCASH">JazzCash (P2P)</option>
                                    <option value="EASYPAISA">EasyPaisa (P2P)</option>
                                    <option value="BANK">Local Bank Transfer</option>
                                </select>
                                <input type="number" step="any" placeholder="Amount" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} required style={{ width: '100%', padding: '8px', backgroundColor: '#2b313a', border: '1px solid #474d57', color: '#fff', borderRadius: '4px', marginBottom: '15px', boxSizing: 'border-box' }} />
                                <button type="submit" style={{ width: '100%', padding: '10px', backgroundColor: '#f6465d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Confirm Withdrawal</button>
                            </form>
                        )}

                        {activeModal === 'ADMIN' && (
                            <div style={{ textAlign: 'center' }}>
                                <h3 style={{ color: '#f0b90b' }}>Owner Profit</h3>
                                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0ecb81', margin: '20px 0' }}>${Number(getAdminVal()).toFixed(2)}</div>
                                <button onClick={() => setActiveModal(null)} style={{ width: '100%', padding: '10px', backgroundColor: '#2b313a', color: '#fff', border: 'none', borderRadius: '4px' }}>Close</button>
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