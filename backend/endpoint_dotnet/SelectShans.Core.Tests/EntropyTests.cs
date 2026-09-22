using System;
using System.IO;
using Xunit;
using SelectShans.Endpoint.Detection;

namespace SelectShans.Endpoint.Tests
{
    public class EntropyTests : IDisposable
    {
        private readonly string _tempDir;

        public EntropyTests()
        {
            _tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
            Directory.CreateDirectory(_tempDir);
        }

        public void Dispose()
        {
            if (Directory.Exists(_tempDir))
            {
                Directory.Delete(_tempDir, true);
            }
        }

        [Fact]
        public void CalculateEntropy_LowEntropyFile_ReturnsLowScore()
        {
            string path = Path.Combine(_tempDir, "low.txt");
            File.WriteAllText(path, new string('A', 1000));

            double entropy = EntropyAnalyzer.CalculateEntropy(path);
            Assert.True(entropy < 1.0, $"Entropy should be low, got {entropy}");
        }

        [Fact]
        public void CalculateEntropy_HighEntropyFile_ReturnsHighScore()
        {
            string path = Path.Combine(_tempDir, "high.bin");
            byte[] data = new byte[8192];
            new Random().NextBytes(data);
            File.WriteAllBytes(path, data);

            double entropy = EntropyAnalyzer.CalculateEntropy(path);
            Assert.True(entropy > 7.0, $"Entropy should be high, got {entropy}");
        }

        [Fact]
        public void CalculateEntropy_EmptyFile_ReturnsZero()
        {
            string path = Path.Combine(_tempDir, "empty.txt");
            File.WriteAllText(path, "");

            double entropy = EntropyAnalyzer.CalculateEntropy(path);
            Assert.Equal(0.0, entropy);
        }

        [Fact]
        public void CalculateEntropy_NonExistentFile_ReturnsZero()
        {
            double entropy = EntropyAnalyzer.CalculateEntropy(Path.Combine(_tempDir, "missing.txt"));
            Assert.Equal(0.0, entropy);
        }

        [Fact]
        public void CalculateEntropy_LargeFile_IsBoundedTo8KB()
        {
            string path = Path.Combine(_tempDir, "large.bin");
            // Create a file where the first 8KB is low entropy (A's), and the rest is high entropy.
            // Since it's bounded to 8KB, the result should be low entropy.
            using (var fs = new FileStream(path, FileMode.Create))
            {
                fs.Write(System.Text.Encoding.ASCII.GetBytes(new string('A', 8192)));

                byte[] randomData = new byte[100000];
                new Random().NextBytes(randomData);
                fs.Write(randomData);
            }

            double entropy = EntropyAnalyzer.CalculateEntropy(path);
            Assert.True(entropy < 1.0, $"Entropy should be low because only the first 8KB is sampled, got {entropy}");
        }
    }
}
