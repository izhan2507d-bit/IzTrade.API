using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;
using IzTrade.API.Data;
using IzTrade.API.DTOs;
using IzTrade.API.Models;

namespace IzTrade.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _context;

        public AuthController(AppDbContext context)
        {
            _context = context;
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] UserRegisterDto request)
        {
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            {
                return BadRequest("Email and password are required.");
            }

            var existingUser = await _context.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == request.Email.ToLower());
            if (existingUser != null)
            {
                return BadRequest("An account with this email already exists.");
            }

            // 1. New User Create Karein
            var user = new User
            {
                Email = request.Email,
                PasswordHash = HashPassword(request.Password),
                CreatedAt = DateTime.UtcNow
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            // 2. Demo Practice Trading Ke Liye $100,000,000 USDT Balance Set Karein
            var usdtWallet = new Wallet
            {
                UserId = user.Id,
                Currency = "USDT",
                Balance = 100000000.0m, // 100 Million USDT
                LockedBalance = 0.0m
            };

            var btcWallet = new Wallet
            {
                UserId = user.Id,
                Currency = "BTC",
                Balance = 0.0m,
                LockedBalance = 0.0m
            };

            _context.Wallets.AddRange(usdtWallet, btcWallet);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Registration successful!", user = new { id = user.Id, email = user.Email } });
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] UserLoginDto request)
        {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == request.Email.ToLower());
            if (user == null || user.PasswordHash != HashPassword(request.Password))
            {
                return BadRequest("Invalid email or password.");
            }

            return Ok(new { message = "Login successful!", user = new { id = user.Id, email = user.Email } });
        }

        private string HashPassword(string password)
        {
            using var sha256 = SHA256.Create();
            var bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(password));
            return Convert.ToBase64String(bytes);
        }
    }
}
