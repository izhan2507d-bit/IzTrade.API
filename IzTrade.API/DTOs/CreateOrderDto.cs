namespace IzTrade.API.DTOs
{
    public class CreateOrderDto
    {
        public long UserId { get; set; } // long supports big numbers like 1791385350102
        public string Symbol { get; set; } = "BTCUSDT";
        public string OrderType { get; set; } = "BUY";
        public decimal Price { get; set; }
        public decimal Quantity { get; set; }
    }
}
