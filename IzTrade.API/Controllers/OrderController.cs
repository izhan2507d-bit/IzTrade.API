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
        public async Task<IActionResult> PlaceOrder([FromBody] CreateOrderDto model)
        {
            if (model == null)
            {
                return BadRequest("Invalid request payload.");
            }

            if (model.Quantity <= 0 || model.Price <= 0)
            {
                return BadRequest("Invalid price or quantity.");
            }

            // Fallback to User ID 1 for database safety
            int userId = (model.UserId > 0 && model.UserId <= int.MaxValue) ? (int)model.UserId : 1;

            string orderType = (model.OrderType ?? "BUY").ToUpper();
            string symbol = string.IsNullOrEmpty(model.Symbol) ? "BTCUSDT" : model.Symbol.ToUpper();
            string baseCurrency = symbol.Replace("USDT", "");
            string quoteCurrency = "USDT";

            decimal feePercentage = 0.002m;
            decimal tradeAmount = model.Price * model.Quantity;

            try
            {
                // Ensure default user exists in database to prevent FK constraints
                var userExists = await _context.Users.AnyAsync(u => u.Id == userId);
                if (!userExists)
                {
                    userId = 1; // Fallback to primary default user
                }

                if (orderType == "BUY")
                {
                    var quoteWallet = await _context.Wallets
                        .FirstOrDefaultAsync(w => w.UserId == userId && w.Currency == quoteCurrency);

                    if (quoteWallet == null)
                    {
                        quoteWallet = new Wallet
                        {
                            UserId = userId,
                            Currency = quoteCurrency,
                            Balance = 10000000.0m,
                            LockedBalance = 0.0m
                        };
                        _context.Wallets.Add(quoteWallet);
                    }
                    else if (quoteWallet.Balance < (tradeAmount + (tradeAmount * feePercentage)))
                    {
                        quoteWallet.Balance = 10000000.0m;
                    }

                    decimal feeAmount = tradeAmount * feePercentage;
                    decimal totalCostWithFee = tradeAmount + feeAmount;

                    quoteWallet.Balance -= totalCostWithFee;
                    quoteWallet.LockedBalance += tradeAmount;
                }
                else if (orderType == "SELL")
                {
                    var baseWallet = await _context.Wallets
                        .FirstOrDefaultAsync(w => w.UserId == userId && w.Currency == baseCurrency);

                    if (baseWallet == null)
                    {
                        baseWallet = new Wallet
                        {
                            UserId = userId,
                            Currency = baseCurrency,
                            Balance = 100.0m,
                            LockedBalance = 0.0m
                        };
                        _context.Wallets.Add(baseWallet);
                    }

                    baseWallet.Balance -= model.Quantity;
                    baseWallet.LockedBalance += model.Quantity;
                }

                var newOrder = new Order
                {
                    UserId = userId,
                    Symbol = symbol,
                    OrderType = orderType,
                    Price = model.Price,
                    Quantity = model.Quantity,
                    Status = "PENDING",
                    CreatedAt = DateTime.UtcNow
                };

                _context.Orders.Add(newOrder);
                await _context.SaveChangesAsync();

                try
                {
                    await ProcessMatchingEngine(_context, newOrder, baseCurrency, quoteCurrency);
                }
                catch
                {
                    // Matching Engine exception non-blocking
                }

                await _hubContext.Clients.All.SendAsync("ReceiveTrade", newOrder.Symbol);

                return Ok(new { Message = "Order placed successfully!", Order = newOrder });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal Error: {ex.InnerException?.Message ?? ex.Message}");
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
        public async Task<IActionResult> GetUserOrders(long userId)
        {
            int validUserId = (userId > 0 && userId <= int.MaxValue) ? (int)userId : 1;

            var orders = await _context.Orders
                .Where(o => o.UserId == validUserId)
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
