using IzTrade.API.Data;
using IzTrade.API.DTOs;
using IzTrade.API.Hubs;
using IzTrade.API.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace IzTrade.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class OrderController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IHubContext<MarketHub> _hubContext;

        public OrderController(AppDbContext context, IHubContext<MarketHub> hubContext)
        {
            _context = context;
            _hubContext = hubContext;
        }

        [HttpPost("place")]
        public async Task<IActionResult> PlaceOrder([FromBody] CreateOrderDto dto)
        {
            try
            {
                if (dto == null || dto.Quantity <= 0 || dto.Price <= 0)
                {
                    return BadRequest("Invalid price or quantity.");
                }

                string orderType = dto.OrderType.ToUpper();
                decimal feePercentage = 0.002m; // 0.2% Trading Fee
                decimal tradeAmount = dto.Price * dto.Quantity;

                if (orderType == "BUY")
                {
                    var usdtWallet = await _context.Wallets
                        .FirstOrDefaultAsync(w => w.UserId == dto.UserId && w.Currency == "USDT");

                    if (usdtWallet == null) return BadRequest("User USDT wallet not found.");

                    decimal feeAmount = tradeAmount * feePercentage;
                    decimal totalCostWithFee = tradeAmount + feeAmount;

                    if (usdtWallet.Balance < totalCostWithFee)
                        return BadRequest($"Insufficient USDT balance. Required: {totalCostWithFee} USDT (includes 0.2% fee)");

                    // Deduct cost + fee from buyer wallet & lock funds for order
                    usdtWallet.Balance -= totalCostWithFee;
                    usdtWallet.LockedBalance += tradeAmount;

                    await AddAdminCommission("USDT", feeAmount);
                }
                else if (orderType == "SELL")
                {
                    var btcWallet = await _context.Wallets
                        .FirstOrDefaultAsync(w => w.UserId == dto.UserId && w.Currency == "BTC");

                    if (btcWallet == null || btcWallet.Balance < dto.Quantity)
                        return BadRequest($"Insufficient BTC balance. You need {dto.Quantity} BTC to place this sell order.");

                    // Lock BTC for sell order
                    btcWallet.Balance -= dto.Quantity;
                    btcWallet.LockedBalance += dto.Quantity;
                }

                var newOrder = new Order
                {
                    UserId = dto.UserId,
                    Symbol = string.IsNullOrEmpty(dto.Symbol) ? "BTCUSDT" : dto.Symbol,
                    OrderType = orderType,
                    Price = dto.Price,
                    Quantity = dto.Quantity,
                    Status = "PENDING",
                    CreatedAt = DateTime.UtcNow
                };

                _context.Orders.Add(newOrder);
                await _context.SaveChangesAsync();

                // Direct Matching Engine Execution
                await ProcessMatchingEngine(_context, newOrder);

                // Send SignalR Update Realtime
                await _hubContext.Clients.All.SendAsync("ReceiveTrade", newOrder.Symbol);

                return Ok(new { Message = "Order placed successfully!", Order = newOrder });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal Server Error: {ex.Message}");
            }
        }

        private async Task ProcessMatchingEngine(AppDbContext db, Order newOrder)
        {
            Order? matchingOrder = null;

            if (newOrder.OrderType == "SELL")
            {
                matchingOrder = await db.Orders
                    .Where(o => o.Symbol == newOrder.Symbol
                             && o.OrderType == "BUY"
                             && o.Status == "PENDING"
                             && o.Price >= newOrder.Price
                             && o.Quantity == newOrder.Quantity)
                    .OrderByDescending(o => o.Price)
                    .FirstOrDefaultAsync();
            }
            else if (newOrder.OrderType == "BUY")
            {
                matchingOrder = await db.Orders
                    .Where(o => o.Symbol == newOrder.Symbol
                             && o.OrderType == "SELL"
                             && o.Status == "PENDING"
                             && o.Price <= newOrder.Price
                             && o.Quantity == newOrder.Quantity)
                    .OrderBy(o => o.Price)
                    .FirstOrDefaultAsync();
            }

            if (matchingOrder != null)
            {
                newOrder.Status = "FILLED";
                matchingOrder.Status = "FILLED";

                var buyOrder = newOrder.OrderType == "BUY" ? newOrder : matchingOrder;
                var sellOrder = newOrder.OrderType == "SELL" ? newOrder : matchingOrder;

                var trade = new Trade
                {
                    BuyOrderId = buyOrder.Id,
                    SellOrderId = sellOrder.Id,
                    Symbol = newOrder.Symbol,
                    Price = buyOrder.Price,
                    Quantity = buyOrder.Quantity,
                    ExecutedAt = DateTime.UtcNow
                };
                db.Trades.Add(trade);

                decimal totalAmount = buyOrder.Price * buyOrder.Quantity;
                decimal feePercentage = 0.002m;
                decimal sellFee = totalAmount * feePercentage;
                decimal sellerNetUsdt = totalAmount - sellFee;

                // Buyer Wallet Updates
                var buyerUsdtWallet = await db.Wallets
                    .FirstOrDefaultAsync(w => w.UserId == buyOrder.UserId && w.Currency == "USDT");
                if (buyerUsdtWallet != null)
                {
                    buyerUsdtWallet.LockedBalance -= totalAmount;
                }

                var buyerBtcWallet = await db.Wallets
                    .FirstOrDefaultAsync(w => w.UserId == buyOrder.UserId && w.Currency == "BTC");
                if (buyerBtcWallet == null)
                {
                    buyerBtcWallet = new Wallet { UserId = buyOrder.UserId, Currency = "BTC", Balance = buyOrder.Quantity, LockedBalance = 0.0m };
                    db.Wallets.Add(buyerBtcWallet);
                }
                else
                {
                    buyerBtcWallet.Balance += buyOrder.Quantity;
                }

                // Seller Wallet Updates
                var sellerBtcWallet = await db.Wallets
                    .FirstOrDefaultAsync(w => w.UserId == sellOrder.UserId && w.Currency == "BTC");
                if (sellerBtcWallet != null)
                {
                    sellerBtcWallet.LockedBalance -= sellOrder.Quantity;
                }

                var sellerUsdtWallet = await db.Wallets
                    .FirstOrDefaultAsync(w => w.UserId == sellOrder.UserId && w.Currency == "USDT");
                if (sellerUsdtWallet == null)
                {
                    sellerUsdtWallet = new Wallet { UserId = sellOrder.UserId, Currency = "USDT", Balance = sellerNetUsdt, LockedBalance = 0.0m };
                    db.Wallets.Add(sellerUsdtWallet);
                }
                else
                {
                    sellerUsdtWallet.Balance += sellerNetUsdt;
                }

                var adminWallet = await db.AdminWallets.FirstOrDefaultAsync(a => a.Currency == "USDT");
                if (adminWallet == null)
                {
                    db.AdminWallets.Add(new AdminWallet { Currency = "USDT", TotalCommissionEarned = sellFee });
                }
                else
                {
                    adminWallet.TotalCommissionEarned += sellFee;
                }

                await db.SaveChangesAsync();
            }
        }

        private async Task AddAdminCommission(string currency, decimal amount)
        {
            var adminWallet = await _context.AdminWallets.FirstOrDefaultAsync(a => a.Currency == currency);
            if (adminWallet == null)
            {
                _context.AdminWallets.Add(new AdminWallet { Currency = currency, TotalCommissionEarned = amount });
            }
            else
            {
                adminWallet.TotalCommissionEarned += amount;
            }
        }

        [HttpGet("user/{userId}")]
        public async Task<IActionResult> GetUserOrders(int userId)
        {
            var orders = await _context.Orders
                .Where(o => o.UserId == userId)
                .OrderByDescending(o => o.CreatedAt)
                .ToListAsync();

            return Ok(orders);
        }

        [HttpGet("orderbook/{symbol}")]
        public async Task<IActionResult> GetOrderBook(string symbol)
        {
            var bids = await _context.Orders
                .Where(o => o.Symbol == symbol && o.OrderType == "BUY" && o.Status == "PENDING")
                .OrderByDescending(o => o.Price)
                .ToListAsync();

            var asks = await _context.Orders
                .Where(o => o.Symbol == symbol && o.OrderType == "SELL" && o.Status == "PENDING")
                .OrderBy(o => o.Price)
                .ToListAsync();

            return Ok(new { Bids = bids, Asks = asks });
        }
    }
}