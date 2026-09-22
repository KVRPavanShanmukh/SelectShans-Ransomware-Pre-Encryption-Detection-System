using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SelectShans.Endpoint.Configuration;
using SelectShans.Endpoint.Models;

namespace SelectShans.Endpoint.Telemetry
{
    public class TelemetryService : BackgroundService
    {
        private readonly ILogger<TelemetryService> _logger;
        private readonly EndpointOptions _options;
        private readonly HttpClient _httpClient;
        private readonly string _dbPath;
        private readonly string _endpointId;
        private readonly string _hostname;

        public TelemetryService(ILogger<TelemetryService> logger, IOptions<EndpointOptions> options)
        {
            _logger = logger;
            _options = options.Value;
            _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };

            var appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var appDir = Path.Combine(appData, "SelectShans", "db");
            Directory.CreateDirectory(appDir);
            _dbPath = Path.Combine(appDir, "telemetry.db");

            _hostname = Environment.MachineName;
            _endpointId = LoadOrCreateIdentity(Path.Combine(appData, "SelectShans", "identity.json"));

            InitializeDatabase();
        }

        private string LoadOrCreateIdentity(string path)
        {
            if (File.Exists(path))
            {
                try
                {
                    var json = File.ReadAllText(path);
                    using var doc = JsonDocument.Parse(json);
                    if (doc.RootElement.TryGetProperty("endpoint_id", out var idProp))
                        return idProp.GetString() ?? Guid.NewGuid().ToString();
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to load identity.");
                }
            }

            var newId = Guid.NewGuid().ToString();
            try
            {
                var content = JsonSerializer.Serialize(new { endpoint_id = newId });
                File.WriteAllText(path, content);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to save new identity.");
            }
            return newId;
        }

        private void InitializeDatabase()
        {
            using var conn = new SqliteConnection($"Data Source={_dbPath}");
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT,
                    payload TEXT,
                    priority INTEGER DEFAULT 0,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )";
            cmd.ExecuteNonQuery();
        }

        public void QueueEvent(string eventType, object payload, int priority = 0)
        {
            try
            {
                using var conn = new SqliteConnection($"Data Source={_dbPath}");
                conn.Open();

                // Enforce bounded queue
                using var countCmd = conn.CreateCommand();
                countCmd.CommandText = "SELECT COUNT(*) FROM events";
                var count = (long)(countCmd.ExecuteScalar() ?? 0L);

                if (count >= _options.QueueLimit)
                {
                    using var delCmd = conn.CreateCommand();
                    delCmd.CommandText = "DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY priority ASC, timestamp ASC LIMIT 1000)";
                    delCmd.ExecuteNonQuery();
                    _logger.LogWarning("Queue full. Dropped oldest events.");
                }

                using var insertCmd = conn.CreateCommand();
                insertCmd.CommandText = "INSERT INTO events (event_type, payload, priority) VALUES (@type, @payload, @priority)";
                insertCmd.Parameters.AddWithValue("@type", eventType);
                insertCmd.Parameters.AddWithValue("@payload", JsonSerializer.Serialize(payload));
                insertCmd.Parameters.AddWithValue("@priority", priority);
                insertCmd.ExecuteNonQuery();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to queue telemetry event.");
            }
        }

        public void QueueAlert(TelemetryPayload payload)
        {
            payload.detector_id = _endpointId;
            payload.hostname = _hostname;
            QueueEvent("sync_activities", payload, priority: 10);
        }

        public void QueuePing()
        {
            var ping = new PingPayload
            {
                token = _options.DetectorToken,
                endpoint_id = _endpointId,
                hostname = _hostname,
                version = "1.0.0",
                os = "Windows"
            };
            QueueEvent("ping", ping, priority: 1);
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            int backoffSeconds = 5;
            DateTime lastPing = DateTime.MinValue;

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    if ((DateTime.UtcNow - lastPing).TotalSeconds >= _options.HeartbeatIntervalSeconds)
                    {
                        QueuePing();
                        lastPing = DateTime.UtcNow;
                    }

                    var rows = new List<(long Id, string Type, string Payload)>();
                    using (var conn = new SqliteConnection($"Data Source={_dbPath}"))
                    {
                        conn.Open();
                        using var cmd = conn.CreateCommand();
                        cmd.CommandText = "SELECT id, event_type, payload FROM events ORDER BY priority DESC, timestamp ASC LIMIT 50";
                        using var reader = cmd.ExecuteReader();
                        while (reader.Read())
                        {
                            rows.Add((reader.GetInt64(0), reader.GetString(1), reader.GetString(2)));
                        }
                    }

                    if (rows.Count == 0)
                    {
                        await Task.Delay(TimeSpan.FromSeconds(backoffSeconds), stoppingToken);
                        continue;
                    }

                    var activities = new List<TelemetryPayload>();
                    var pings = new List<PingPayload>();
                    var rowIds = new List<long>();

                    foreach (var row in rows)
                    {
                        rowIds.Add(row.Id);
                        if (row.Type == "sync_activities")
                        {
                            var act = JsonSerializer.Deserialize<TelemetryPayload>(row.Payload);
                            if (act != null) activities.Add(act);
                        }
                        else if (row.Type == "ping")
                        {
                            var ping = JsonSerializer.Deserialize<PingPayload>(row.Payload);
                            if (ping != null) pings.Add(ping);
                        }
                    }

                    bool success = true;

                    // Send Sync
                    if (activities.Count > 0)
                    {
                        var syncPayload = new SyncActivitiesPayload
                        {
                            token = _options.DetectorToken,
                            activities = activities.ToArray()
                        };
                        var response = await _httpClient.PostAsJsonAsync($"{_options.BackendApiUrl}/api/detector/sync-activities", syncPayload, stoppingToken);
                        if (!response.IsSuccessStatusCode)
                        {
                            success = false;
                            _logger.LogWarning($"Backend rejected sync: {response.StatusCode}");
                        }
                    }

                    // Send Ping
                    // If multiple pings accumulated, send the latest one.
                    if (pings.Count > 0 && success)
                    {
                        var latestPing = pings[^1];
                        var response = await _httpClient.PostAsJsonAsync($"{_options.BackendApiUrl}/api/detector/ping", latestPing, stoppingToken);
                        if (!response.IsSuccessStatusCode)
                        {
                            success = false;
                            _logger.LogWarning($"Backend rejected ping: {response.StatusCode}");
                        }
                    }

                    if (success)
                    {
                        using var conn = new SqliteConnection($"Data Source={_dbPath}");
                        conn.Open();
                        using var delCmd = conn.CreateCommand();
                        var ids = string.Join(",", rowIds);
                        delCmd.CommandText = $"DELETE FROM events WHERE id IN ({ids})";
                        delCmd.ExecuteNonQuery();

                        backoffSeconds = 5; // reset
                    }
                    else
                    {
                        backoffSeconds = Math.Min(backoffSeconds * 2, 300);
                        await Task.Delay(TimeSpan.FromSeconds(backoffSeconds), stoppingToken);
                    }
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _logger.LogError(ex, "Error in telemetry loop.");
                    backoffSeconds = Math.Min(backoffSeconds * 2, 300);
                    await Task.Delay(TimeSpan.FromSeconds(backoffSeconds), stoppingToken);
                }
            }
        }

        public override async Task StopAsync(CancellationToken cancellationToken)
        {
            _logger.LogInformation("Service is stopping, attempting final telemetry flush...");
            try
            {
                // Bounded flush: Wait max 3 seconds for a final flush
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));

                var activities = new List<TelemetryPayload>();
                var rowIds = new List<long>();

                using (var conn = new SqliteConnection($"Data Source={_dbPath}"))
                {
                    conn.Open();
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = "SELECT id, payload FROM events WHERE event_type = 'sync_activities' ORDER BY priority DESC, timestamp ASC LIMIT 50";
                    using var reader = cmd.ExecuteReader();
                    while (reader.Read())
                    {
                        rowIds.Add(reader.GetInt64(0));
                        var act = JsonSerializer.Deserialize<TelemetryPayload>(reader.GetString(1));
                        if (act != null) activities.Add(act);
                    }
                }

                if (activities.Count > 0)
                {
                    var syncPayload = new SyncActivitiesPayload
                    {
                        token = _options.DetectorToken,
                        activities = activities.ToArray()
                    };
                    var response = await _httpClient.PostAsJsonAsync($"{_options.BackendApiUrl}/api/detector/sync-activities", syncPayload, cts.Token);
                    if (response.IsSuccessStatusCode)
                    {
                        using var conn = new SqliteConnection($"Data Source={_dbPath}");
                        conn.Open();
                        using var delCmd = conn.CreateCommand();
                        var ids = string.Join(",", rowIds);
                        delCmd.CommandText = $"DELETE FROM events WHERE id IN ({ids})";
                        delCmd.ExecuteNonQuery();
                        _logger.LogInformation("Successfully flushed final telemetry.");
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Final telemetry flush failed or timed out.");
            }
            await base.StopAsync(cancellationToken);
        }
    }
}
