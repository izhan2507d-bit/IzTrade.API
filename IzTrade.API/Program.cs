using IzTrade.API.Data;
using IzTrade.API.Hubs;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// 1. Configure Open CORS Policy (Must be before AddControllers)
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// 2. Add Controllers & SignalR
builder.Services.AddControllers();
builder.Services.AddSignalR();

// 3. Database Context
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

// 4. Apply CORS Middleware First
app.UseCors("AllowAll");

// 5. Test Route
app.MapGet("/", () => Results.Json(new { status = "Online", message = "IzTrade API Backend is running successfully!" }));

app.UseRouting();
app.UseAuthorization();

app.MapControllers();
app.MapHub<MarketHub>("/hubs/market");

app.Run();
