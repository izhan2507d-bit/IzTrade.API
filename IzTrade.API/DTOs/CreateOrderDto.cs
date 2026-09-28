namespace IzTrade.API.DTOs
{
    public class CreateOrderDto
    {
        public int UserId { get; set; }
        public string Symbol { get; set; } = "BTCUSDT";
        public string OrderType { get; set; } = "BUY"; // "BUY" ya "SELL"
        public decimal Price { get; set; }
        public decimal Quantity { get; set; }
    }
}