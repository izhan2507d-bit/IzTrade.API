using IzTrade.API.Data;
using IzTrade.API.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

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

        // 1. User Wallet Balances Fetch Karein
        [HttpGet("user/{userId}")]
        public async Task<IActionResult> GetUserWallets(int userId)
        {
            var wallets = await _context.Wallets
                .Where(w => w.UserId == userId)
                .ToListAsync();

            if (!wallets.Any())
            {
                return NotFound("Is user ka koi wallet nahi mila.");
            }

            return Ok(wallets);
        }

        // 2. Real Money Deposit Endpoint (1% Platform Fee)
        [HttpPost("deposit")]
        public async Task<IActionResult> Deposit([FromBody] DepositDto dto)
        {
            if (dto.Amount <= 0) return BadRequest("Deposit amount zero se bari honi chahiye.");

            decimal feePercentage = 0.01m; // 1% Fee
            decimal feeAmount = dto.Amount * feePercentage;
            decimal netAmount = dto.Amount - feeAmount;

            var wallet = await _context.Wallets
                .FirstOrDefaultAsync(w => w.UserId == dto.UserId && w.Currency == dto.Currency);

            if (wallet == null)
            {
                wallet = new Wallet
                {
                    UserId = dto.UserId,
                    Currency = dto.Currency,
                    Balance = netAmount
                };
                _context.Wallets.Add(wallet);
            }
            else
            {
                wallet.Balance += netAmount;
            }

            // Fee Ko Admin Wallet Mein Record Karein
            await AddAdminCommission(dto.Currency, feeAmount);

            await _context.SaveChangesAsync();

            return Ok(new
            {
                Message = $"{netAmount} {dto.Currency} aapke wallet mein add ho gaye hain.",
                FeeCharged = feeAmount,
                NewBalance = wallet.Balance
            });
        }

        // 3. Real Money Withdrawal Endpoint ($1 / Flat Fee)
        [HttpPost("withdraw")]
        public async Task<IActionResult> Withdraw([FromBody] WithdrawDto dto)
        {
            if (dto.Amount <= 0) return BadRequest("Withdrawal amount invalid hai.");

            decimal flatFee = 1.0m; // Fixed $1 Fee
            decimal totalRequired = dto.Amount + flatFee;

            var wallet = await _context.Wallets
                .FirstOrDefaultAsync(w => w.UserId == dto.UserId && w.Currency == dto.Currency);

            if (wallet == null || wallet.Balance < totalRequired)
            {
                return BadRequest($"Insufficient balance. Total required: {totalRequired} {dto.Currency} (includes 1 {dto.Currency} fee).");
            }

            wallet.Balance -= totalRequired;

            // Withdrawal Fee Admin Wallet Mein Record Karein
            await AddAdminCommission(dto.Currency, flatFee);

            await _context.SaveChangesAsync();

            return Ok(new
            {
                Message = $"{dto.Amount} {dto.Currency} withdraw ho gaye hain.",
                FeeCharged = flatFee,
                RemainingBalance = wallet.Balance
            });
        }

        // 4. Admin / Owner Earnings Dashboard Endpoint
        [HttpGet("admin/commissions")]
        public async Task<IActionResult> GetAdminCommissions()
        {
            var adminWallets = await _context.AdminWallets.ToListAsync();
            return Ok(adminWallets);
        }

        // Helper Method for Admin Commission Update
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
    }

    public class DepositDto
    {
        public int UserId { get; set; }
        public string Currency { get; set; } = "USDT";
        public decimal Amount { get; set; }
    }

    public class WithdrawDto
    {
        public int UserId { get; set; }
        public string Currency { get; set; } = "USDT";
        public decimal Amount { get; set; }
    }
}