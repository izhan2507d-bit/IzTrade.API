using IzTrade.API.Data;
using IzTrade.API.Hubs;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// 1. Configure Flexible CORS Policy (SignalR Compatible)
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

// 3. Database Context Setup (SQLite - Lightweight & Railway Compatible)
builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseSqlite("Data Source=iztrade.db");
});

var app = builder.Build();

// 4. Auto-Ensure Database & Tables Created
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
}

// 5. Test Route
app.MapGet("/", () => Results.Json(new { status = "Online", message = "IzTrade API Backend is running successfully!" }));

// 6. Middleware Pipeline
app.UseRouting();
app.UseCors("AllowAll");

app.UseAuthorization();

app.MapControllers();
app.MapHub<MarketHub>("/hubs/market");

app.Run();
