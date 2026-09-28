namespace IzTrade.API.Models
{
    public class Trade
    {
        public int Id { get; set; }
        public int BuyOrderId { get; set; }
        public int SellOrderId { get; set; }
        public string Symbol { get; set; } = string.Empty;
        public decimal Price { get; set; }
        public decimal Quantity { get; set; }
        public DateTime ExecutedAt { get; set; } = DateTime.UtcNow;
    }
}