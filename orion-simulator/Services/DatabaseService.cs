using Microsoft.EntityFrameworkCore;
using OrionSimulator.Data;
using OrionSimulator.Models;

namespace OrionSimulator.Services;

public class DatabaseService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<DatabaseService> _logger;
    private bool _isInitialized = false;

    public DatabaseService(IServiceProvider serviceProvider, ILogger<DatabaseService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    private async Task EnsureDatabaseAsync()
    {
        if (_isInitialized) return;

        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.EnsureCreatedAsync();
        _isInitialized = true;
    }

    public async Task SaveMetricsAsync(List<ServerMetric> metrics)
    {
        await EnsureDatabaseAsync();
        try
        {
            var validMetrics = metrics.Where(m => !string.IsNullOrEmpty(m.serverId));

            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            db.Metrics.AddRange(validMetrics);
            await db.SaveChangesAsync();

            _logger.LogInformation("Successfully saved {Count} metrics to SQLite", metrics.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error saving metrics to SQLite");
        }
    }

    public async Task ClearAllMetricsAsync()
    {
        await EnsureDatabaseAsync();
        try
        {
            _logger.LogInformation("Clearing all existing metrics from SQLite...");
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            db.Metrics.RemoveRange(db.Metrics);
            await db.SaveChangesAsync();
            _logger.LogInformation("Successfully deleted all existing metrics from SQLite");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error clearing metrics from SQLite");
        }
    }
}
