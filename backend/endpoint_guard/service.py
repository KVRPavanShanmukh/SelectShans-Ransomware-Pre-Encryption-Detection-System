import sys
import time
import win32serviceutil
import win32service
import win32event
import servicemanager
from logger import logger
from config import config_manager
from canary import canary_manager
from monitor import monitor_manager
from telemetry import telemetry_manager

class EndpointGuardService(win32serviceutil.ServiceFramework):
    _svc_name_ = "SelectShansEndpointGuard"
    _svc_display_name_ = "SelectShans Endpoint Guard"
    _svc_description_ = "Continuously monitors the endpoint for ransomware-like behavior and securely reports events to the SelectShans backend."

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.stop_event = win32event.CreateEvent(None, 0, 0, None)
        self.running = True

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        logger.info("Service is stopping...")
        self.running = False
        win32event.SetEvent(self.stop_event)

    def SvcDoRun(self):
        try:
            servicemanager.LogMsg(
                servicemanager.EVENTLOG_INFORMATION_TYPE,
                servicemanager.PYS_SERVICE_STARTED,
                (self._svc_name_, '')
            )
            self.main()
        except Exception as e:
            logger.critical(f"Service failed to run: {e}")
            self.SvcStop()

    def main(self):
        logger.info(f"Starting SelectShans Endpoint Guard (Version {config_manager.get('service_version')})")
        logger.info(f"Endpoint ID: {config_manager.endpoint_id}")
        
        try:
            canary_manager.deploy_canaries()
            monitor_manager.start()
            
            heartbeat_interval = config_manager.get("heartbeat_interval_seconds", 60)
            last_heartbeat = 0
            
            while self.running:
                now = time.time()
                if now - last_heartbeat >= heartbeat_interval:
                    telemetry_manager.send_ping()
                    last_heartbeat = now
                    
                # Wait up to 1 second for the stop event
                rc = win32event.WaitForSingleObject(self.stop_event, 1000)
                if rc == win32event.WAIT_OBJECT_0:
                    break
                    
        except Exception as e:
            logger.error(f"Error in main loop: {e}")
        finally:
            logger.info("Initiating shutdown sequence...")
            monitor_manager.stop()
            canary_manager.cleanup()
            telemetry_manager.shutdown()
            logger.info("Shutdown complete.")

def debug():
    # Helper to run directly in terminal without service installation
    class MockService:
        def __init__(self):
            self.running = True
            import threading
            self.stop_event = threading.Event()
    
    svc = EndpointGuardService([])
    import threading
    svc.stop_event = threading.Event()
    
    def win32_mock(event, timeout):
        if event.wait(timeout / 1000.0):
            return win32event.WAIT_OBJECT_0
        return win32event.WAIT_TIMEOUT
        
    win32event.WaitForSingleObject = win32_mock
    
    print("Running in debug mode. Press Ctrl+C to stop.")
    try:
        svc.main()
    except KeyboardInterrupt:
        svc.SvcStop()

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'debug':
        debug()
    else:
        win32serviceutil.HandleCommandLine(EndpointGuardService)
