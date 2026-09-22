using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Moq.Protected;
using Xunit;
using SelectShans.Endpoint.Configuration;
using SelectShans.Endpoint.Models;
using SelectShans.Endpoint.Telemetry;

namespace SelectShans.Endpoint.Tests
{
    public class TelemetryTests : IDisposable
    {
        private readonly string _dbDir;
        private readonly string _dbPath;

        public TelemetryTests()
        {
            _dbDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SelectShans", "db");
            _dbPath = Path.Combine(_dbDir, $"telemetry_{Guid.NewGuid()}.db");
            Directory.CreateDirectory(_dbDir);
        }

        public void Dispose()
        {
            SqliteConnection.ClearAllPools();
            if (File.Exists(_dbPath))
            {
                try { File.Delete(_dbPath); } catch { }
            }
        }

        private TelemetryService CreateService(EndpointOptions options, HttpStatusCode responseCode)
        {
            var handlerMock = new Mock<HttpMessageHandler>();
            var response = new HttpResponseMessage
            {
                StatusCode = responseCode,
                Content = new StringContent("{}")
            };

            handlerMock
                .Protected()
                .Setup<Task<HttpResponseMessage>>(
                    "SendAsync",
                    ItExpr.IsAny<HttpRequestMessage>(),
                    ItExpr.IsAny<CancellationToken>()
                )
                .ReturnsAsync(response);

            var httpClient = new HttpClient(handlerMock.Object);

            var optMock = Options.Create(options);
            var service = new TelemetryService(new NullLogger<TelemetryService>(), optMock);

            // Inject mocked httpclient using reflection
            var field = typeof(TelemetryService).GetField("_httpClient", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            field?.SetValue(service, httpClient);

            // Inject custom db path using reflection
            var dbField = typeof(TelemetryService).GetField("_dbPath", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            dbField?.SetValue(service, _dbPath);

            return service;
        }

        [Fact]
        public async Task EventIsRemovedOnSuccess()
        {
            var service = CreateService(new EndpointOptions(), HttpStatusCode.OK);

            // Ensure DB exists before queuing
            var initDb = typeof(TelemetryService).GetMethod("InitializeDatabase", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            initDb?.Invoke(service, null);

            service.QueueAlert(new TelemetryPayload { event_type = "mass_write" });

            await service.StartAsync(CancellationToken.None);
            await Task.Delay(500); // Give background task time to process
            await service.StopAsync(CancellationToken.None);

            using var conn = new SqliteConnection($"Data Source={_dbPath}");
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT COUNT(*) FROM events";
            var count = (long)(cmd.ExecuteScalar() ?? 1L);

            Assert.Equal(0, count);
        }

        [Fact]
        public async Task EventIsRetainedOnFailure()
        {
            var service = CreateService(new EndpointOptions(), HttpStatusCode.InternalServerError);

            var initDb = typeof(TelemetryService).GetMethod("InitializeDatabase", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            initDb?.Invoke(service, null);

            service.QueueAlert(new TelemetryPayload { event_type = "mass_write" });

            await service.StartAsync(CancellationToken.None);
            await Task.Delay(500);
            await service.StopAsync(CancellationToken.None);

            using var conn = new SqliteConnection($"Data Source={_dbPath}");
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT COUNT(*) FROM events";
            var count = (long)(cmd.ExecuteScalar() ?? 0L);

            Assert.True(count > 0, "Event should be retained after HTTP failure");
        }

        [Fact]
        public async Task Shutdown_PerformsBoundedFlush()
        {
            var service = CreateService(new EndpointOptions(), HttpStatusCode.OK);

            var initDb = typeof(TelemetryService).GetMethod("InitializeDatabase", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            initDb?.Invoke(service, null);

            service.QueueAlert(new TelemetryPayload { event_type = "mass_write" });

            // Call StopAsync without starting the loop. It should flush the event.
            await service.StopAsync(CancellationToken.None);

            using var conn = new SqliteConnection($"Data Source={_dbPath}");
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT COUNT(*) FROM events";
            var count = (long)(cmd.ExecuteScalar() ?? 1L);

            Assert.Equal(0, count); // Event should be deleted by the StopAsync flush
        }
    }
}
