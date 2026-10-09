using IzTrade.API.Data;
using IzTrade.API.Hubs;
using Microsoft.EntityFrameworkCore;
using Npgsql;

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

// 3. PostgreSQL Database Setup (Convert URI to Npgsql format)
var rawConnectionString = Environment.GetEnvironmentVariable("DATABASE_URL") 
                       ?? builder.Configuration.GetConnectionString("DefaultConnection");

string formattedConnectionString = ConvertPostgresUrlToConnectionString(rawConnectionString);

builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseNpgsql(formattedConnectionString);
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

// Helper Function: Convert postgresql:// URI to Npgsql Connection String
static string ConvertPostgresUrlToConnectionString(string url)
{
    if (string.IsNullOrEmpty(url) || !url.StartsWith("postgres"))
        return url;

    var uri = new Uri(url);
    var userInfo = uri.UserInfo.Split(':');

    var builder = new NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.Port > 0 ? uri.Port : 5432,
        Username = userInfo.Length > 0 ? userInfo[0] : "",
        Password = userInfo.Length > 1 ? userInfo[1] : "",
        Database = uri.AbsolutePath.TrimStart('/'),
        SslMode = SslMode.Prefer,
        TrustServerCertificate = true
    };

    return builder.ToString();
}
