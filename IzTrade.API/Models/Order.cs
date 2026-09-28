namespace IzTrade.API.Models
{
    public class Order
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string Symbol { get; set; } = string.Empty;
        public string OrderType { get; set; } = string.Empty; // "BUY" ya "SELL"
        public decimal Price { get; set; }
        public decimal Quantity { get; set; }
        public string Status { get; set; } = "PENDING"; // "PENDING", "FILLED", "CANCELLED"
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}