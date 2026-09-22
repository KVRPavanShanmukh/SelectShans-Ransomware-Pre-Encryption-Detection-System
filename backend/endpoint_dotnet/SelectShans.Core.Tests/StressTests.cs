using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;
using SelectShans.Endpoint.Configuration;
using SelectShans.Endpoint.Detection;
using SelectShans.Endpoint.Models;
using SelectShans.Endpoint.Telemetry;

namespace SelectShans.Endpoint.Tests
{
    public class StressTests
    {
        [Fact]
        public async Task ChannelStress_50000Events_DetectionSurvives()
        {
            var options = new EndpointOptions
            {
                ModificationThreshold = 20,
                MonitoringWindowSeconds = 10,
                QueueLimit = 10000 // Force channel constraint
            };
            var optMock = Options.Create(options);

            var telemetryMock = new Mock<TelemetryService>(new NullLogger<TelemetryService>(), optMock);
            var riskMock = new Mock<RiskEngine>(new NullLogger<RiskEngine>(), telemetryMock.Object);

            var engine = new DetectionEngine(new NullLogger<DetectionEngine>(), optMock, riskMock.Object);

            // Set up channel exactly as in MonitoringWorker
            var channel = Channel.CreateBounded<FileEvent>(new BoundedChannelOptions(options.QueueLimit)
            {
                FullMode = BoundedChannelFullMode.DropOldest
            });

            // Start consumer
            var consumerTask = Task.Run(async () =>
            {
                await foreach (var ev in channel.Reader.ReadAllAsync())
                {
                    engine.ProcessEvent(ev);
                }
            });

            // Producer: Burst 50,000 events instantly
            int burstSize = 50000;
            string testDir = @"C:\stress_test";

            Stopwatch sw = Stopwatch.StartNew();
            for (int i = 0; i < burstSize; i++)
            {
                channel.Writer.TryWrite(new FileEvent
                {
                    EventType = "modified",
                    SrcPath = Path.Combine(testDir, $"file_{i}.txt"),
                    Timestamp = DateTime.UtcNow
                });
            }
            sw.Stop();

            // Allow consumer to catch up
            channel.Writer.Complete();
            await consumerTask;

            // Assertions
            Assert.True(sw.ElapsedMilliseconds < 5000, "Producer blocked excessively during burst");

            // Even if events were dropped due to capacity, we produced 50,000 instantly.
            // The channel holds the last 10,000.
            // 10,000 is way above ModificationThreshold (20).
            // Thus, we expect the RiskEngine to have been triggered at least once!
            riskMock.Verify(r => r.Evaluate("mass_write", It.IsAny<int>(), testDir, It.IsAny<string>()), Times.AtLeastOnce);
        }
    }
}
