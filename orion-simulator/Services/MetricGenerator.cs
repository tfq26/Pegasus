using OrionSimulator.Models;

namespace OrionSimulator.Services;

public class MetricGenerator
{
    private readonly Random _random = new();
    private readonly Dictionary<string, ServerState> _serverStates = new();
    private int _intervalSeconds = 120; // Default to 2 mins (10 min mode)
    private int _intervalMode = 10; // 10, 20, or 30
    private bool _isHighLoad = false;
    private bool _isPaused = false;
    private string _lastRunMessage = "";

    private bool _isManualOverride = false;

    public MetricGenerator()
    {
        InitializeServers();
    }

    public bool IsInActiveWindow()
    {
        if (_isManualOverride) 
        {
            if (_overrideExpiration.HasValue && DateTime.UtcNow > _overrideExpiration.Value)
            {
                // Override period expired, revert to auto
                ClearManualOverride();
                // Fall through to check regular schedule
            }
            else
            {
                return true; // Still within manual override window
            }
        }

        var hour = DateTime.UtcNow.Hour; // UTC time, or should it be local? Let's use UTC but maybe explain.
        // User said 6 AM to 6 PM. I'll use 6 to 18.
        return hour >= 6 && hour < 18;
    }

    public void SetPaused(bool paused) => _isPaused = paused;
    public bool IsPaused() => _isPaused;
    public void SetLastRunMessage(string msg) => _lastRunMessage = msg;
    public string GetLastRunMessage() => _lastRunMessage;

    private void InitializeServers()
    {
        // App Servers
        for (int i = 1; i <= 8; i++)
        {
            var id = $"app-server-{i}";
            _serverStates[id] = new ServerState(id, "AppServer", $"App Server {i}");
        }

        // Resource Managers
        for (int i = 1; i <= 2; i++)
        {
            var id = $"rm-{i}";
            _serverStates[id] = new ServerState(id, "RM", $"Resource Manager {i}");
        }

        // Compute Nodes
        for (int i = 1; i <= 15; i++)
        {
            var id = $"compute-{i}";
            _serverStates[id] = new ServerState(id, "ComputeNode", $"Compute Node {i}");
        }
    }

    public List<ServerMetric> GenerateMetrics()
    {
        var metrics = new List<ServerMetric>();
        foreach (var state in _serverStates.Values)
        {
            metrics.Add(CreateMetricForServer(state));
        }
        return metrics;
    }

    private ServerMetric CreateMetricForServer(ServerState state)
    {
        if (state.Status == "offline")
        {
            return new ServerMetric
            {
                serverId = state.Id,
                serverType = state.Type,
                serverName = state.Name,
                status = "offline",
                cpuPercent = 0,
                memoryPercent = 0,
                energyWatts = 5, // Idle baseline
                requestsPerSec = 0,
                networkMbps = 0,
                diskIoOps = 0,
                latencyMs = 0,
                timestamp = DateTime.UtcNow
            };
        }

        if (state.Status == "stopped")
        {
            return new ServerMetric
            {
                serverId = state.Id,
                serverType = state.Type,
                serverName = state.Name,
                status = "stopped",
                timestamp = DateTime.UtcNow
                // Other fields remain null
            };
        }

        double loadMultiplier = _isHighLoad ? 1.8 : 1.0;
        if (state.InjectedError != null) loadMultiplier *= 0.5;

        return new ServerMetric
        {
            serverId = state.Id,
            serverType = state.Type,
            serverName = state.Name,
            status = state.Status,
            cpuPercent = Math.Clamp(state.BaseCpu + (_random.NextDouble() * 10 - 5) + (20 * (loadMultiplier - 1)), 0, 100),
            memoryPercent = Math.Clamp(state.BaseMem + (_random.NextDouble() * 5 - 2), 0, 100),
            energyWatts = Math.Clamp(100 + (state.BaseCpu * 2) * loadMultiplier + (_random.NextDouble() * 20), 50, 500),
            requestsPerSec = state.Type == "AppServer" ? Math.Clamp(500 * loadMultiplier + (_random.NextDouble() * 100), 0, 10000) : 0,
            networkMbps = Math.Clamp(100 * loadMultiplier + (_random.NextDouble() * 50), 0, 1000),
            diskIoOps = Math.Clamp(1000 * loadMultiplier + (_random.NextDouble() * 500), 0, 50000),
            latencyMs = Math.Clamp(5 * loadMultiplier + (_random.NextDouble() * 2), 1, 500),
            timestamp = DateTime.UtcNow,
            errorMessage = state.InjectedError
        };
    }

    public void UpdateInterval(int seconds) => _intervalSeconds = seconds;
    public int GetInterval() => _intervalSeconds;
    public int GetIntervalMode() => _intervalMode;

    private DateTime? _overrideExpiration;

    public void SetIntervalMode(int mode)
    {
        _isManualOverride = true; // User manually selected an interval, so override sleep window
        _intervalMode = mode;
        _overrideExpiration = DateTime.UtcNow.AddMinutes(mode); // Set expiration based on mode minutes

        switch (mode)
        {
            case 10:
                _intervalSeconds = 120; // 2 mins
                break;
            case 20:
                _intervalSeconds = 240; // 4 mins
                break;
            case 30:
                _intervalSeconds = 450; // 7.5 mins
                break;
            default:
                _intervalMode = 10;
                _intervalSeconds = 120;
                break;
        }
    }

    public void ClearManualOverride()
    {
        _isManualOverride = false;
        _overrideExpiration = null;
    }
    
    public bool IsManualOverride() => _isManualOverride;

    public TimeSpan? GetTimeRemaining()
    {
        if (_isManualOverride && _overrideExpiration.HasValue)
        {
            var remaining = _overrideExpiration.Value - DateTime.UtcNow;
            return remaining > TimeSpan.Zero ? remaining : TimeSpan.Zero;
        }
        return null;
    }

    public void SetHighLoad(bool enabled) => _isHighLoad = enabled;
    public bool IsHighLoad() => _isHighLoad;

    public bool UpdateServerStatus(string serverId, string status, string? error = null)
    {
        if (_serverStates.TryGetValue(serverId, out var state))
        {
            state.Status = status;
            state.InjectedError = error;
            return true;
        }
        return false;
    }

    public List<ServerState> GetCurrentStates() => _serverStates.Values.ToList();

    public class ServerState
    {
        public string Id { get; }
        public string Type { get; }
        public string Name { get; }
        public string Status { get; set; } = "online";
        public string? InjectedError { get; set; }
        public double BaseCpu { get; }
        public double BaseMem { get; }

        public ServerState(string id, string type, string name)
        {
            Id = id;
            Type = type;
            Name = name;
            var rand = new Random();
            BaseCpu = rand.Next(20, 60);
            BaseMem = rand.Next(30, 70);
        }
    }
}
