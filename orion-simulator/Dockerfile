# Build Stage
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy project files and restore
COPY ["OrionSimulator.csproj", "./"]
RUN dotnet restore "OrionSimulator.csproj"

# Copy everything else and build
COPY . .
RUN dotnet publish "OrionSimulator.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Production Stage
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Expose the Control API port
EXPOSE 5050
ENV ASPNETCORE_URLS=http://+:5050

ENTRYPOINT ["dotnet", "OrionSimulator.dll"]
