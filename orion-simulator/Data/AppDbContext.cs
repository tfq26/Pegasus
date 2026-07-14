using Microsoft.EntityFrameworkCore;
using OrionSimulator.Models;

namespace OrionSimulator.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public DbSet<ServerMetric> Metrics { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<ServerMetric>().HasKey(m => m.id);
        base.OnModelCreating(modelBuilder);
    }
}
