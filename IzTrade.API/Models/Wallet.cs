namespace IzTrade.API.Models
{
    public class Wallet
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string Currency { get; set; } = "USDT";
        public decimal Balance { get; set; } = 0.0m;
        public decimal LockedBalance { get; set; } = 0.0m;

        public User? User { get; set; }
    }

    // Owner Commission Track Karne Ke Liye New Model
    public class AdminWallet
    {
        public int Id { get; set; }
        public string Currency { get; set; } = "USDT";
        public decimal TotalCommissionEarned { get; set; } = 0.0m;
    }
}