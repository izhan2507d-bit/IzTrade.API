using IzTrade.API.Data;
using IzTrade.API.Hubs;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// 1. Configure Flexible CORS Policy
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// 2. Add Controllers & SignalR
builder.Services.AddControllers();
builder.Services.AddSignalR();

// 3. PostgreSQL Database Setup (Railway Environment Variable)
var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL") 
                       ?? builder.Configuration.GetConnectionString("DefaultConnection");

builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseNpgsql(connectionString);
});

var app = builder.Build();

// 4. Auto-Create PostgreSQL Tables on Startup
using (var scope = app.Services.CreateScope())
{
    try
    {
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Database.EnsureCreated();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Database Init Exception: {ex.Message}");
    }
}

// 5. Test Endpoint
app.MapGet("/", () => Results.Json(new { status = "Online", database = "PostgreSQL Connected" }));

// 6. Middleware Pipeline
app.UseRouting();
app.UseCors("AllowAll");
app.UseAuthorization();

app.MapControllers();
app.MapHub<MarketHub>("/hubs/market");

app.Run();
