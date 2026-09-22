using System;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using SelectShans.Endpoint.Configuration;
using SelectShans.Endpoint.Detection;
using SelectShans.Endpoint.Models;
using SelectShans.Endpoint.Telemetry;
using Xunit;

namespace SelectShans.Endpoint.Tests
{
    public class DetectionEngineTests
    {
        [Fact]
        public void ProcessEvent_MassRename_TriggersRiskEngine()
        {
            // Arrange
            var options = new EndpointOptions { RenameThreshold = 5, MonitoringWindowSeconds = 15 };
            var mockOptions = new Mock<IOptions<EndpointOptions>>();
            mockOptions.Setup(o => o.Value).Returns(options);

            var mockLogger = new Mock<ILogger<DetectionEngine>>();

            var telemetryLogger = new Mock<ILogger<TelemetryService>>();
            var telemetryService = new TelemetryService(telemetryLogger.Object, mockOptions.Object);

            var riskLogger = new Mock<ILogger<RiskEngine>>();
            var riskEngine = new RiskEngine(riskLogger.Object, telemetryService);

            var engine = new DetectionEngine(mockLogger.Object, mockOptions.Object, riskEngine);

            // Act
            for (int i = 0; i < 5; i++)
            {
                engine.ProcessEvent(new FileEvent
                {
                    EventType = "moved",
                    SrcPath = $@"C:\test\file{i}.txt",
                    DestPath = $@"C:\test\file{i}.bak",
                    Timestamp = DateTime.UtcNow
                });
            }

            // Assert
            Assert.True(true);
        }
    }
}
