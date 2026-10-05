using IzTrade.API.Data;
using IzTrade.API.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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

        // Helper to parse UserId safely whether sent as int or string
        private static int GetNumericUserId(object? userIdObj)
        {
            if (userIdObj == null) return 0;
            if (userIdObj is int intVal) return intVal;
            if (userIdObj is long longVal) return (int)longVal;
            if (int.TryParse(userIdObj.ToString(), out int parsed)) return parsed;
            return 0;
        }

        // 1. User Wallet Balances Fetch
        [HttpGet("user/{userId}")]
        public async Task<IActionResult> GetUserWallets(int userId)
        {
            var wallets = await _context.Wallets
                .Where(w => w.UserId == userId)
                .ToListAsync();

            if (!wallets.Any())
            {
                return NotFound(new { message = "Is user ka koi wallet nahi mila." });
            }

            return Ok(wallets);
        }

        // 2. Real Money Deposit Endpoint (1% Platform Fee)
        [HttpPost("deposit")]
        public async Task<IActionResult> Deposit([FromBody] DepositDto dto)
        {
            int userId = GetNumericUserId(dto.UserId);
            if (userId <= 0)
            {
                return BadRequest(new { message = "Invalid User ID. Please login again." });
            }

            if (dto.Amount <= 0)
            {
                return BadRequest(new { message = "Deposit amount zero se bari honi chahiye." });
            }

            string currency = string.IsNullOrWhiteSpace(dto.Currency) ? "USDT" : dto.Currency.ToUpper();

            decimal feePercentage = 0.01m; // 1% Fee
            decimal feeAmount = dto.Amount * feePercentage;
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
                message = $"{netAmount} {currency} aapke wallet mein add ho gaye hain.",
                feeCharged = feeAmount,
                newBalance = wallet.Balance
            });
        }

        // 3. Real Money Withdrawal Endpoint ($1 Flat Fee)
        [HttpPost("withdraw")]
        public async Task<IActionResult> Withdraw([FromBody] WithdrawDto dto)
        {
            int userId = GetNumericUserId(dto.UserId);
            if (userId <= 0)
            {
                return BadRequest(new { message = "Invalid User ID. Please login again." });
            }

            if (dto.Amount <= 0)
            {
                return BadRequest(new { message = "Withdrawal amount invalid hai." });
            }

            string currency = string.IsNullOrWhiteSpace(dto.Currency) ? "USDT" : dto.Currency.ToUpper();
            decimal flatFee = 1.0m; // Fixed $1 Fee
            decimal totalRequired = dto.Amount + flatFee;

            var wallet = await _context.Wallets
                .FirstOrDefaultAsync(w => w.UserId == userId && w.Currency.ToUpper() == currency);

            if (wallet == null || wallet.Balance < totalRequired)
            {
                return BadRequest(new { message = $"Insufficient balance. Total required: {totalRequired} {currency} (includes 1 {currency} fee)." });
            }

            wallet.Balance -= totalRequired;

            await AddAdminCommission(currency, flatFee);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = $"{dto.Amount} {currency} withdraw ho gaye hain.",
                feeCharged = flatFee,
                remainingBalance = wallet.Balance
            });
        }

        // 4. Admin Earnings Dashboard Endpoint
        [HttpGet("admin/commissions")]
        public async Task<IActionResult> GetAdminCommissions()
        {
            var adminWallets = await _context.AdminWallets.ToListAsync();
            return Ok(adminWallets);
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

    public class DepositDto
    {
        [JsonPropertyName("userId")]
        public object? UserId { get; set; }

        [JsonPropertyName("currency")]
        public string Currency { get; set; } = "USDT";

        [JsonPropertyName("amount")]
        public decimal Amount { get; set; }
    }

    public class WithdrawDto
    {
        [JsonPropertyName("userId")]
        public object? UserId { get; set; }

        [JsonPropertyName("currency")]
        public string Currency { get; set; } = "USDT";

        [JsonPropertyName("amount")]
        public decimal Amount { get; set; }

        public string? Method { get; set; }
        public string? AccountTitle { get; set; }
        public string? AccountNumber { get; set; }
        public string? BankName { get; set; }
    }
}
