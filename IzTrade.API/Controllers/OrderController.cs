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
            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                if (dto == null || dto.UserId <= 0)
                {
                    return BadRequest("Valid UserId is required.");
                }

                if (dto.Quantity <= 0 || dto.Price <= 0)
                {
                    return BadRequest("Invalid price or quantity.");
                }

                int userId = dto.UserId;
                string orderType = dto.OrderType.ToUpper();
                string symbol = string.IsNullOrEmpty(dto.Symbol) ? "BTCUSDT" : dto.Symbol.ToUpper();

                string baseCurrency = symbol.Replace("USDT", "");
                string quoteCurrency = "USDT";

                decimal feePercentage = 0.002m; // 0.2% Fee
                decimal tradeAmount = dto.Price * dto.Quantity;

                if (orderType == "BUY")
                {
                    var quoteWallet = await _context.Wallets
                        .FirstOrDefaultAsync(w => w.UserId == userId && w.Currency == quoteCurrency);

                    if (quoteWallet == null) return BadRequest($"User {quoteCurrency} wallet not found.");

                    decimal feeAmount = tradeAmount * feePercentage;
                    decimal totalCostWithFee = tradeAmount + feeAmount;

                    if (quoteWallet.Balance < totalCostWithFee)
                        return BadRequest($"Insufficient {quoteCurrency} balance. Required: {totalCostWithFee}");

                    quoteWallet.Balance -= totalCostWithFee;
                    quoteWallet.LockedBalance += tradeAmount;
                }
                else if (orderType == "SELL")
                {
                    var baseWallet = await _context.Wallets
                        .FirstOrDefaultAsync(w => w.UserId == userId && w.Currency == baseCurrency);

                    if (baseWallet == null || baseWallet.Balance < dto.Quantity)
                        return BadRequest($"Insufficient {baseCurrency} balance. Required: {dto.Quantity}");

                    baseWallet.Balance -= dto.Quantity;
                    baseWallet.LockedBalance += dto.Quantity;
                }

                var newOrder = new Order
                {
                    UserId = userId,
                    Symbol = symbol,
                    OrderType = orderType,
                    Price = dto.Price,
                    Quantity = dto.Quantity,
                    Status = "PENDING",
                    CreatedAt = DateTime.UtcNow
                };

                _context.Orders.Add(newOrder);
                await _context.SaveChangesAsync();

                await ProcessMatchingEngine(_context, newOrder, baseCurrency, quoteCurrency);

                await transaction.CommitAsync();

                await _hubContext.Clients.All.SendAsync("ReceiveTrade", newOrder.Symbol);

                return Ok(new { Message = "Order placed successfully!", Order = newOrder });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return StatusCode(500, $"Internal Server Error: {ex.Message}");
            }
        }

        private async Task ProcessMatchingEngine(AppDbContext db, Order newOrder, string baseCurrency, string quoteCurrency)
        {
            Order? matchingOrder = null;

            if (newOrder.OrderType == "SELL")
            {
                matchingOrder = await db.Orders
                    .Where(o => o.Symbol == newOrder.Symbol
                             && o.OrderType == "BUY"
                             && o.Status == "PENDING"
                             && o.Price >= newOrder.Price)
                    .OrderByDescending(o => o.Price)
                    .ThenBy(o => o.CreatedAt)
                    .FirstOrDefaultAsync();
            }
            else if (newOrder.OrderType == "BUY")
            {
                matchingOrder = await db.Orders
                    .Where(o => o.Symbol == newOrder.Symbol
                             && o.OrderType == "SELL"
                             && o.Status == "PENDING"
                             && o.Price <= newOrder.Price)
                    .OrderBy(o => o.Price)
                    .ThenBy(o => o.CreatedAt)
                    .FirstOrDefaultAsync();
            }

            if (matchingOrder != null)
            {
                decimal matchQuantity = Math.Min(newOrder.Quantity, matchingOrder.Quantity);

                var buyOrder = newOrder.OrderType == "BUY" ? newOrder : matchingOrder;
                var sellOrder = newOrder.OrderType == "SELL" ? newOrder : matchingOrder;

                var trade = new Trade
                {
                    BuyOrderId = buyOrder.Id,
                    SellOrderId = sellOrder.Id,
                    Symbol = newOrder.Symbol,
                    Price = matchingOrder.Price,
                    Quantity = matchQuantity,
                    ExecutedAt = DateTime.UtcNow
                };
                db.Trades.Add(trade);

                decimal matchAmount = matchingOrder.Price * matchQuantity;
                decimal feePercentage = 0.002m;
                decimal sellFee = matchAmount * feePercentage;
                decimal sellerNetQuote = matchAmount - sellFee;

                var buyerBaseWallet = await db.Wallets
                    .FirstOrDefaultAsync(w => w.UserId == buyOrder.UserId && w.Currency == baseCurrency);
                if (buyerBaseWallet == null)
                {
                    db.Wallets.Add(new Wallet { UserId = buyOrder.UserId, Currency = baseCurrency, Balance = matchQuantity, LockedBalance = 0 });
                }
                else
                {
                    buyerBaseWallet.Balance += matchQuantity;
                }

                var buyerQuoteWallet = await db.Wallets
                    .FirstOrDefaultAsync(w => w.UserId == buyOrder.UserId && w.Currency == quoteCurrency);
                if (buyerQuoteWallet != null)
                {
                    buyerQuoteWallet.LockedBalance -= matchAmount;
                }

                var sellerBaseWallet = await db.Wallets
                    .FirstOrDefaultAsync(w => w.UserId == sellOrder.UserId && w.Currency == baseCurrency);
                if (sellerBaseWallet != null)
                {
                    sellerBaseWallet.LockedBalance -= matchQuantity;
                }

                var sellerQuoteWallet = await db.Wallets
                    .FirstOrDefaultAsync(w => w.UserId == sellOrder.UserId && w.Currency == quoteCurrency);
                if (sellerQuoteWallet == null)
                {
                    db.Wallets.Add(new Wallet { UserId = sellOrder.UserId, Currency = quoteCurrency, Balance = sellerNetQuote, LockedBalance = 0 });
                }
                else
                {
                    sellerQuoteWallet.Balance += sellerNetQuote;
                }

                newOrder.Quantity -= matchQuantity;
                matchingOrder.Quantity -= matchQuantity;

                newOrder.Status = newOrder.Quantity == 0 ? "FILLED" : "PARTIAL";
                matchingOrder.Status = matchingOrder.Quantity == 0 ? "FILLED" : "PARTIAL";

                var adminWallet = await db.AdminWallets.FirstOrDefaultAsync(a => a.Currency == quoteCurrency);
                if (adminWallet == null)
                {
                    db.AdminWallets.Add(new AdminWallet { Currency = quoteCurrency, TotalCommissionEarned = sellFee });
                }
                else
                {
                    adminWallet.TotalCommissionEarned += sellFee;
                }

                await db.SaveChangesAsync();
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
                .Where(o => o.Symbol == symbol && o.OrderType == "BUY" && (o.Status == "PENDING" || o.Status == "PARTIAL"))
                .OrderByDescending(o => o.Price)
                .ToListAsync();

            var asks = await _context.Orders
                .Where(o => o.Symbol == symbol && o.OrderType == "SELL" && (o.Status == "PENDING" || o.Status == "PARTIAL"))
                .OrderBy(o => o.Price)
                .ToListAsync();

            return Ok(new { Bids = bids, Asks = asks });
        }
    }
}