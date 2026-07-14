namespace OrionSimulator.Models;

public record ServerMetric
{
    public string id { get; init; } = Guid.NewGuid().ToString();
    public string serverId { get; init; } = string.Empty;
    public string serverType { get; init; } = string.Empty; // AppServer, RM, ComputeNode
    public string serverName { get; init; } = string.Empty;
    public string status { get; init; } = "online"; // online, offline, error, quiescing
    public double? cpuPercent { get; init; }
    public double? memoryPercent { get; init; }
    public double? energyWatts { get; init; }
    public double? requestsPerSec { get; init; }
    public double? networkMbps { get; init; }
    public double? diskIoOps { get; init; }
    public double? latencyMs { get; init; }
    public DateTime timestamp { get; init; } = DateTime.UtcNow;
    public string? errorMessage { get; init; }
}
