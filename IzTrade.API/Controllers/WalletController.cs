using IzTrade.API.Data;
using IzTrade.API.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace IzTrade.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class WalletController : ControllerBase
    {
        private readonly AppDbContext _context;

        public WalletController(AppDbContext context)
        {
            _context = context;
        }

        // 1. Fetch Wallets (Accepts 'long' to prevent 400 Bad Request Overflow)
        [HttpGet("user/{userId}")]
        public async Task<IActionResult> GetUserWallets(long userId)
        {
            // Int64 ko safe Int32 range mein fallback karein
            int validUserId = (userId > 0 && userId <= int.MaxValue) ? (int)userId : 1;

            // Step 1: Check & Ensure User Exists in DB (Safety against FK error)
            var userExists = await _context.Users.AnyAsync(u => u.Id == validUserId);
            if (!userExists)
            {
                var fallbackUser = new User
                {
                    Email = $"user_{validUserId}@iztrade.com",
                    PasswordHash = "GUEST_ACCOUNT",
                    CreatedAt = DateTime.UtcNow
                };
                _context.Users.Add(fallbackUser);
                await _context.SaveChangesAsync();
                validUserId = fallbackUser.Id;
            }

            // Step 2: Ensure USDT Wallet Exists
            var usdtWallet = await _context.Wallets
                .FirstOrDefaultAsync(w => w.UserId == validUserId && w.Currency.ToUpper() == "USDT");

            if (usdtWallet == null)
            {
                usdtWallet = new Wallet
                {
                    UserId = validUserId,
                    Currency = "USDT",
                    Balance = 100000000.0m, // Starting USDT
                    LockedBalance = 0.0m
                };
                _context.Wallets.Add(usdtWallet);
            }

            // Step 3: Ensure BTC Wallet Exists
            var btcWallet = await _context.Wallets
                .FirstOrDefaultAsync(w => w.UserId == validUserId && w.Currency.ToUpper() == "BTC");

            if (btcWallet == null)
            {
                btcWallet = new Wallet
                {
                    UserId = validUserId,
                    Currency = "BTC",
                    Balance = 10.0m, // Default 10 BTC
                    LockedBalance = 0.0m
                };
                _context.Wallets.Add(btcWallet);
            }

            await _context.SaveChangesAsync();

            // Step 4: Return Complete List of Wallets
            var wallets = await _context.Wallets
                .Where(w => w.UserId == validUserId)
                .Select(w => new
                {
                    w.Id,
                    w.UserId,
                    w.Currency,
                    w.Balance,
                    w.LockedBalance,
                    AvailableBalance = w.Balance
                })
                .ToListAsync();

            return Ok(wallets);
        }

        // 2. Deposit Endpoint
        [HttpPost("deposit")]
        public async Task<IActionResult> Deposit([FromBody] FlexibleDepositDto dto)
        {
            int userId = ParseUserId(dto.UserId);

            if (userId <= 0)
            {
                return BadRequest(new { message = "Invalid User Session." });
            }

            if (dto.Amount <= 0)
            {
                return BadRequest(new { message = "Deposit amount must be greater than zero." });
            }

            string currency = string.IsNullOrWhiteSpace(dto.Currency) ? "USDT" : dto.Currency.ToUpper();
            decimal feeAmount = dto.Amount * 0.01m;
            decimal netAmount = dto.Amount - feeAmount;

            var wallet = await _context.Wallets
                .FirstOrDefaultAsync(w => w.UserId == userId && w.Currency.ToUpper() == currency);

            if (wallet == null)
            {
                wallet = new Wallet
                {
                    UserId = userId,
                    Currency = currency,
                    Balance = netAmount,
                    LockedBalance = 0.0m
                };
                _context.Wallets.Add(wallet);
            }
            else
            {
                wallet.Balance += netAmount;
            }

            await AddAdminCommission(currency, feeAmount);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = $"{netAmount} {currency} deposited successfully!",
                feeCharged = feeAmount,
                newBalance = wallet.Balance
            });
        }

        private static int ParseUserId(object? rawUserId)
        {
            if (rawUserId == null) return 1;
            if (rawUserId is JsonElement element)
            {
                if (element.ValueKind == JsonValueKind.Number && element.TryGetInt64(out long val))
                {
                    return (val > 0 && val <= int.MaxValue) ? (int)val : 1;
                }
                if (element.ValueKind == JsonValueKind.String && long.TryParse(element.GetString(), out long strVal))
                {
                    return (strVal > 0 && strVal <= int.MaxValue) ? (int)strVal : 1;
                }
            }
            if (long.TryParse(rawUserId.ToString(), out long parsedLong))
            {
                return (parsedLong > 0 && parsedLong <= int.MaxValue) ? (int)parsedLong : 1;
            }
            return 1;
        }

        private async Task AddAdminCommission(string currency, decimal amount)
        {
            var adminWallet = await _context.AdminWallets.FirstOrDefaultAsync(a => a.Currency.ToUpper() == currency.ToUpper());
            if (adminWallet == null)
            {
                _context.AdminWallets.Add(new AdminWallet { Currency = currency.ToUpper(), TotalCommissionEarned = amount });
            }
            else
            {
                adminWallet.TotalCommissionEarned += amount;
            }
        }
    }

    public class FlexibleDepositDto
    {
        [JsonPropertyName("userId")]
        public JsonElement UserId { get; set; }

        [JsonPropertyName("currency")]
        public string Currency { get; set; } = "USDT";

        [JsonPropertyName("amount")]
        public decimal Amount { get; set; }
    }
}
