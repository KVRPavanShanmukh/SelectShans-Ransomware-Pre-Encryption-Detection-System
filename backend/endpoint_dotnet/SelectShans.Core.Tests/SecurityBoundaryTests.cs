using System;
using System.IO;
using System.Reflection;
using System.Threading.Channels;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SelectShans.Endpoint.Configuration;
using SelectShans.Endpoint.Models;
using SelectShans.Endpoint.Monitoring;
using Xunit;

namespace SelectShans.Endpoint.Tests
{
    public class SecurityBoundaryTests
    {
        [Theory]
        [InlineData(@"D:\ImportantData", @"D:\ImportantData\file.txt", true)]
        [InlineData(@"D:\ImportantData", @"D:\ImportantData\sub\file.txt", true)]
        [InlineData(@"D:\ImportantData", @"D:\ImportantData2\file.txt", false)]
        [InlineData(@"D:\ImportantData", @"C:\Windows\System32\cmd.exe", false)]
        public void PathBoundary_Validation_WorksCorrectly(string root, string eventPath, bool expected)
        {
            var options = new EndpointOptions { ProtectedFolder = root };
            var monitor = new FileSystemMonitor(new NullLogger<FileSystemMonitor>(), Options.Create(options), Channel.CreateUnbounded<FileEvent>());

            // Set normalized root via reflection to bypass Start() which needs real directories
            var rootField = typeof(FileSystemMonitor).GetField("_normalizedRoot", BindingFlags.NonPublic | BindingFlags.Instance);
            string normRoot = Path.GetFullPath(root);
            if (!normRoot.EndsWith(Path.DirectorySeparatorChar.ToString()))
                normRoot += Path.DirectorySeparatorChar;

            rootField?.SetValue(monitor, normRoot);

            var method = typeof(FileSystemMonitor).GetMethod("IsWithinBoundary", BindingFlags.NonPublic | BindingFlags.Instance);
            var result = (bool)method!.Invoke(monitor, new object[] { eventPath })!;

            Assert.Equal(expected, result);
        }
    }
}
