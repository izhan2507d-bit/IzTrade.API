FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Direct copy since Root Directory is already IzTrade.API
COPY . .

# Simple restore without full path prefix
RUN dotnet restore
RUN dotnet publish -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "IzTrade.API.dll"]
