using System;
using System.IO;
using System.Threading;
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
    public class DetectionTests
    {
        private DetectionEngine CreateEngine(EndpointOptions options, out Mock<RiskEngine> riskEngineMock)
        {
            var optMock = Options.Create(options);
            var telemetryMock = new Mock<TelemetryService>(new NullLogger<TelemetryService>(), optMock);
            riskEngineMock = new Mock<RiskEngine>(new NullLogger<RiskEngine>(), telemetryMock.Object);

            return new DetectionEngine(new NullLogger<DetectionEngine>(), optMock, riskEngineMock.Object);
        }

        [Fact]
        public void NormalSingleFile_DoesNotTrigger()
        {
            var options = new EndpointOptions { ModificationThreshold = 5 };
            var engine = CreateEngine(options, out var riskMock);

            engine.ProcessEvent(new FileEvent { EventType = "modified", SrcPath = @"C:\test\file1.txt" });

            riskMock.Verify(r => r.Evaluate(It.IsAny<string>(), It.IsAny<int>(), It.IsAny<string>(), It.IsAny<string>()), Times.Never);
        }

        [Fact]
        public void MassWrites_TriggersAlert()
        {
            var options = new EndpointOptions { ModificationThreshold = 5, EntropyThreshold = 0.0 };
            var engine = CreateEngine(options, out var riskMock);

            for (int i = 0; i < 5; i++)
            {
                engine.ProcessEvent(new FileEvent { EventType = "modified", SrcPath = @$"C:\test\file{i}.txt" });
            }

            riskMock.Verify(r => r.Evaluate("mass_write", 5, @"C:\test", @"C:\test\file4.txt"), Times.Once);
        }

        [Fact]
        public void SuspiciousExtension_TriggersInstantly()
        {
            var options = new EndpointOptions();
            var engine = CreateEngine(options, out var riskMock);

            engine.ProcessEvent(new FileEvent { EventType = "moved", SrcPath = @"C:\test\file1.txt", DestPath = @"C:\test\file1.locked" });

            riskMock.Verify(r => r.Evaluate("suspicious_extension", 1, @"C:\test", @"C:\test\file1.locked"), Times.Once);
        }

        [Fact]
        public void Cooldown_SuppressesDuplicateAlerts()
        {
            var options = new EndpointOptions { ModificationThreshold = 5, MonitoringWindowSeconds = 5 };
            var engine = CreateEngine(options, out var riskMock);

            // First burst
            for (int i = 0; i < 5; i++)
            {
                engine.ProcessEvent(new FileEvent { EventType = "modified", SrcPath = @$"C:\test\file{i}.txt" });
            }
            riskMock.Verify(r => r.Evaluate("mass_write", 5, @"C:\test", @"C:\test\file4.txt"), Times.Once);

            // Second burst (during cooldown)
            for (int i = 5; i < 15; i++)
            {
                engine.ProcessEvent(new FileEvent { EventType = "modified", SrcPath = @$"C:\test\file{i}.txt" });
            }
            // Should still be once due to cooldown
            riskMock.Verify(r => r.Evaluate("mass_write", It.IsAny<int>(), @"C:\test", It.IsAny<string>()), Times.Once);
        }

        [Fact]
        public void SlidingWindow_ExpiresOldEvents()
        {
            var options = new EndpointOptions { ModificationThreshold = 5, MonitoringWindowSeconds = 1 };
            var engine = CreateEngine(options, out var riskMock);

            for (int i = 0; i < 4; i++)
            {
                engine.ProcessEvent(new FileEvent { EventType = "modified", SrcPath = @$"C:\test\file{i}.txt", Timestamp = DateTime.UtcNow.AddSeconds(-2) });
            }

            Thread.Sleep(1500); // Wait for expiration

            engine.ProcessEvent(new FileEvent { EventType = "modified", SrcPath = @"C:\test\file4.txt", Timestamp = DateTime.UtcNow });

            riskMock.Verify(r => r.Evaluate(It.IsAny<string>(), It.IsAny<int>(), It.IsAny<string>(), It.IsAny<string>()), Times.Never);
        }

        [Fact]
        public void TriPointEntropy_SparseEncryption_CalculatesElevatedEntropy()
        {
            string tempFile = Path.Combine(Path.GetTempPath(), $"sparse_test_{Guid.NewGuid():N}.bin");
            try
            {
                // Create a 64KB file where head (first 24KB) is zero bytes,
                // and middle/tail are high-entropy random bytes
                byte[] data = new byte[65536];
                Random.Shared.NextBytes(data.AsSpan(24576));
                File.WriteAllBytes(tempFile, data);

                double entropy = EntropyAnalyzer.CalculateEntropy(tempFile);
                // Tri-point sampling reads head (zeros), middle (random), tail (random)
                Assert.True(entropy > 5.0, $"Expected elevated entropy for sparse file, got {entropy}");
            }
            finally
            {
                if (File.Exists(tempFile)) File.Delete(tempFile);
            }
        }

        [Fact]
        public void HighEntropy_PassesEntropyToRiskEngine()
        {
            var options = new EndpointOptions { ModificationThreshold = 5, EntropyThreshold = 7.0 };
            var engine = CreateEngine(options, out var riskMock);

            string tempFile = Path.Combine(Path.GetTempPath(), $"entropy_surge_{Guid.NewGuid():N}.bin");
            try
            {
                // 32KB of random bytes
                byte[] data = new byte[32768];
                Random.Shared.NextBytes(data);
                File.WriteAllBytes(tempFile, data);

                for (int i = 0; i < 5; i++)
                {
                    engine.ProcessEvent(new FileEvent { EventType = "modified", SrcPath = tempFile });
                }

                string dir = Path.GetDirectoryName(tempFile) ?? "";
                riskMock.Verify(r => r.Evaluate("entropy_surge", 5, dir, tempFile, It.Is<double>(e => e > 7.0)), Times.Once);
            }
            finally
            {
                if (File.Exists(tempFile)) File.Delete(tempFile);
            }
        }
    }
}
