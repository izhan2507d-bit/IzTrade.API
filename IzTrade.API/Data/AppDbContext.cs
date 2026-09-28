using IzTrade.API.Models;
using Microsoft.EntityFrameworkCore;

namespace IzTrade.API.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<User> Users { get; set; }
        public DbSet<Wallet> Wallets { get; set; }
        public DbSet<Order> Orders { get; set; }
        public DbSet<Trade> Trades { get; set; }

        // Owner Commission / Platform Profit Track Karne Ke Liye
        public DbSet<AdminWallet> AdminWallets { get; set; }
    }
}