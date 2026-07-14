using Microsoft.AspNetCore.Mvc;
using OrionSimulator.Services;
using OrionSimulator.Models;
using OrionSimulator.Data;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Add services
builder.Services.AddDbContext<AppDbContext>(options => 
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));
builder.Services.AddSingleton<MetricGenerator>();
builder.Services.AddSingleton<DatabaseService>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseStaticFiles();
app.UseAntiforgery();

app.MapRazorComponents<OrionSimulator.Components.App>()
    .AddInteractiveServerRenderMode();

// Minimal API Endpoints for Control
app.MapGet("/status", (MetricGenerator generator) => 
    Results.Ok(new { 
        Status = "Running", 
        Interval = generator.GetInterval(),
        ServerCount = generator.GetCurrentStates().Count
    }));

app.MapGet("/servers", (MetricGenerator generator) => Results.Ok(generator.GetCurrentStates()));

app.MapPost("/interval", (MetricGenerator generator, [FromBody] IntervalRequest request) => {
    generator.UpdateInterval(request.Seconds);
    return Results.Ok(new { Message = $"Interval updated to {request.Seconds}s" });
});

app.MapPost("/server/{id}/shutdown", (MetricGenerator generator, string id) => {
    if (generator.UpdateServerStatus(id, "offline"))
        return Results.Ok(new { Message = $"Server {id} shut down" });
    return Results.NotFound();
});

app.MapPost("/server/{id}/start", (MetricGenerator generator, string id) => {
    if (generator.UpdateServerStatus(id, "online"))
        return Results.Ok(new { Message = $"Server {id} started" });
    return Results.NotFound();
});

app.MapPost("/server/{id}/error", (MetricGenerator generator, string id, [FromBody] ErrorRequest request) => {
    if (generator.UpdateServerStatus(id, "error", request.Message))
        return Results.Ok(new { Message = $"Error injected into {id}" });
    return Results.NotFound();
});

app.MapPost("/server/{id}/stop", (MetricGenerator generator, string id) => {
    if (generator.UpdateServerStatus(id, "stopped"))
        return Results.Ok(new { Message = $"Server {id} stopped (generating empty data)" });
    return Results.NotFound();
});

app.MapPost("/server/{id}/status", (MetricGenerator generator, string id, [FromBody] StatusRequest request) => {
    if (generator.UpdateServerStatus(id, request.Status, request.Message))
        return Results.Ok(new { Message = $"Server {id} updated to status {request.Status}" });
    return Results.NotFound();
});

app.MapPost("/scenario/high-load", (MetricGenerator generator) => {
    generator.SetHighLoad(true);
    return Results.Ok(new { Message = "High load scenario enabled" });
});

app.MapPost("/scenario/normal", (MetricGenerator generator) => {
    generator.SetHighLoad(false);
    return Results.Ok(new { Message = "Normal operation resumed" });
});

// background simulation loop
_ = Task.Run(async () => {
    // Wait a moment for the server to start
    await Task.Delay(5000);
    
    MetricGenerator? generator = null;
    DatabaseService? database = null;

    try 
    {
        generator = app.Services.GetRequiredService<MetricGenerator>();
        database = app.Services.GetRequiredService<DatabaseService>();
        Console.WriteLine("Simulation services initialized successfully.");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"CRITICAL: Failed to initialize simulation services: {ex.Message}");
        return;
    }

    while (true)
    {
        try 
        {
            if (generator.IsPaused())
            {
                generator.SetLastRunMessage($"Paused manually at {DateTime.UtcNow:HH:mm:ss} UTC");
            }
            else if (!generator.IsInActiveWindow())
            {
                generator.SetLastRunMessage($"Auto-sleep: Outside active window (6AM-6PM UTC) at {DateTime.UtcNow:HH:mm:ss} UTC");
            }
            else
            {
                var metrics = generator.GenerateMetrics();
                await database.SaveMetricsAsync(metrics);
                generator.SetLastRunMessage($"Last run successful at {DateTime.UtcNow:HH:mm:ss} UTC");
            }
        }
        catch (Exception ex)
        {
            var error = $"Simulation Loop Error: {ex.Message}";
            Console.WriteLine(error);
            generator.SetLastRunMessage(error);
        }
        
        await Task.Delay(TimeSpan.FromSeconds(generator.GetInterval()));
    }
});

app.Run();

// DTOs
public record IntervalRequest(int Seconds);
public record ErrorRequest(string Message);
public record StatusRequest(string Status, string? Message);
