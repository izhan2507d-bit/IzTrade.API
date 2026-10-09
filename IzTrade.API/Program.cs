using IzTrade.API.Data;
using IzTrade.API.Hubs;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// 1. Configure Flexible CORS Policy (SignalR Compatible)
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.SetIsOriginAllowed(_ => true) // Vercel & Localhost sab allow ho jayenge
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials(); // SignalR WebSockets ke liye zaroori hai
    });
});

// 2. Add Controllers & SignalR
builder.Services.AddControllers();
builder.Services.AddSignalR();

// 3. Database Context Setup (Railway Cloud Database / Fallback)
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
                       ?? Environment.GetEnvironmentVariable("DATABASE_URL");

builder.Services.AddDbContext<AppDbContext>(options =>
{
    if (!string.IsNullOrEmpty(connectionString) && !connectionString.Contains("localdb", StringComparison.OrdinalIgnoreCase))
    {
        options.UseSqlServer(connectionString);
    }
    else
    {
        // Railway container par LocalDB fail na ho, iske liye default SqlServer configuration
        options.UseSqlServer("Server=tcp:localhost;Database=IzTradeDb;Trusted_Connection=True;TrustServerCertificate=True;");
    }
});

var app = builder.Build();

// 4. Test Route
app.MapGet("/", () => Results.Json(new { status = "Online", message = "IzTrade API Backend is running successfully!" }));

// 5. Middleware Pipeline Order Fix
app.UseRouting();
app.UseCors("AllowAll"); // Routing ke baad CORS apply karein

app.UseAuthorization();

app.MapControllers();
app.MapHub<MarketHub>("/hubs/market");

app.Run();
