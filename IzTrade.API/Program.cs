using IzTrade.API.Data;
using IzTrade.API.Hubs;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// 1. Add Controllers
builder.Services.AddControllers();

// 2. Add SignalR for Real-time WebSockets
builder.Services.AddSignalR();

// 3. Configure CORS for Frontend Integration (Supports Vercel & All Origins)
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyHeader()
              .AllowAnyMethod()
              .SetIsOriginAllowed(_ => true)
              .AllowCredentials();
    });
});

// 4. Database Context Registration (AppDbContext)
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
                       ?? Environment.GetEnvironmentVariable("DATABASE_URL");

builder.Services.AddDbContext<AppDbContext>(options =>
{
    if (!string.IsNullOrEmpty(connectionString))
    {
        options.UseSqlServer(connectionString);
    }
});

var app = builder.Build();

// 5. Root URL Test Route (Backend Online Status Check Karne Ke Liye)
app.MapGet("/", () => Results.Json(new { status = "Online", message = "IzTrade API Backend is running successfully!" }));

// 6. Enable CORS
app.UseCors("AllowAll");

app.UseAuthorization();

app.MapControllers();

// 7. Map SignalR Hub Endpoint
app.MapHub<MarketHub>("/hubs/market");

app.Run();
