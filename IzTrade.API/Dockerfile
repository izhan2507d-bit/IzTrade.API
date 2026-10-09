# Step 1: Build Stage using .NET 9 SDK
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Step 2: Copy csproj and restore dependencies first (for faster caching)
COPY ["IzTrade.API.csproj", "./"]
RUN dotnet restore "IzTrade.API.csproj"

# Step 3: Copy all source files and publish
COPY . .
RUN dotnet publish "IzTrade.API.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Step 4: Setup runtime image
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Step 5: Configure environment and ports
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

# Step 6: Start the application
ENTRYPOINT ["dotnet", "IzTrade.API.dll"]
