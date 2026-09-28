using Microsoft.AspNetCore.SignalR;

namespace IzTrade.API.Hubs
{
    public class MarketHub : Hub
    {
        public async Task SendOrderBookUpdate(string symbol, object orderBook)
        {
            await Clients.All.SendAsync("ReceiveOrderBook", symbol, orderBook);
        }

        public async Task SendTradeUpdate(string symbol, object trade)
        {
            await Clients.All.SendAsync("ReceiveTrade", symbol, trade);
        }
    }
}