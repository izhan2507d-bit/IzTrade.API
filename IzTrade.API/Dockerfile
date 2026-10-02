# Step 1: Use .NET 9 SDK to support newer target frameworks
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Step 2: Copy all project files from the root directory
COPY . .

# Step 3: Restore dependencies and publish the application
RUN dotnet restore "IzTrade.API.csproj"
RUN dotnet publish "IzTrade.API.csproj" -c Release -o /app/publish

# Step 4: Setup runtime image
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Step 5: Configure environment and ports
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

# Step 6: Start the application
ENTRYPOINT ["dotnet", "IzTrade.API.dll"]
