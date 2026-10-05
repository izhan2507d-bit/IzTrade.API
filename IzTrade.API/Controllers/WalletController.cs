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

        // 1. Fetch Wallets
        [HttpGet("user/{userId}")]
        public async Task<IActionResult> GetUserWallets(int userId)
        {
            var wallets = await _context.Wallets
                .Where(w => w.UserId == userId)
                .ToListAsync();

            return Ok(wallets);
        }

        // 2. Guaranteed Safe Deposit Endpoint
        [HttpPost("deposit")]
        public async Task<IActionResult> Deposit([FromBody] FlexibleDepositDto dto)
        {
            // Extract integer UserId safely from any input type
            int userId = ParseUserId(dto.UserId);

            if (userId <= 0)
            {
                return BadRequest(new { message = "Invalid User Session. Please logout and login again." });
            }

            if (dto.Amount <= 0)
            {
                return BadRequest(new { message = "Deposit amount must be greater than zero." });
            }

            string currency = string.IsNullOrWhiteSpace(dto.Currency) ? "USDT" : dto.Currency.ToUpper();
            decimal feeAmount = dto.Amount * 0.01m; // 1% Fee
            decimal netAmount = dto.Amount - feeAmount;

            var wallet = await _context.Wallets
                .FirstOrDefaultAsync(w => w.UserId == userId && w.Currency.ToUpper() == currency);

            if (wallet == null)
            {
                wallet = new Wallet
                {
                    UserId = userId,
                    Currency = currency,
                    Balance = netAmount
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

        // Helper Method for Safe Parsing
        private static int ParseUserId(object? rawUserId)
        {
            if (rawUserId == null) return 0;
            if (rawUserId is JsonElement element)
            {
                if (element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out int val)) return val;
                if (element.ValueKind == JsonValueKind.String && int.TryParse(element.GetString(), out int strVal)) return strVal;
            }
            if (int.TryParse(rawUserId.ToString(), out int parsedInt)) return parsedInt;
            return 0;
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

    // DTO using JsonElement to accept ANY JSON type without throwing 400 JsonException
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
