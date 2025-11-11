using Projects;
using CommunityToolkit.Aspire.Hosting.Bun;
using Aspire.Hosting;

var builder = DistributedApplication.CreateBuilder(args);

// --- Vue Frontend via Bun ---
const string VueProjectDirectory = "../pegasus-ui";

var frontend = builder.AddBunApp("frontend", VueProjectDirectory, "dev")
    .WithExternalHttpEndpoints();

// --- Backend APIs ---
var apiService = builder.AddProject<Projects.Pegasus_ApiService>("apiservice");
var queryApi = builder.AddProject<Projects.QueryApi>("queryapi");

// Pass backend URLs to frontend as environment variables
frontend.WithEnvironment("VITE_API_URL", apiService.GetEndpoint("http"));
frontend.WithEnvironment("VITE_QUERY_API_URL", queryApi.GetEndpoint("http"));

// --- Optional: Tauri desktop app ---
// Pass command, working directory and separate args so the executable is invoked as:
// npm run tauri -- dev
var tauriApp = builder.AddExecutable(
    "desktop",
    "npm",
    "../Pegasus.Desktop",
    "run",
    "tauri",
    "--",
    "dev")
    .WithEnvironment("NODE_ENV", "development")
    .WithReference(apiService)
    .WithReference(queryApi);

builder.Build().Run();
