import queue
import threading
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from logger import logger
from detection import detection_engine
from config import config_manager

class FileEventProcessor(threading.Thread):
    def __init__(self, event_queue):
        super().__init__(daemon=True)
        self.queue = event_queue
        self.running = True

    def run(self):
        while self.running:
            try:
                event = self.queue.get(timeout=1)
                event_type = event.get('type')
                src_path = event.get('src_path')
                dest_path = event.get('dest_path')
                
                detection_engine.process_event(event_type, src_path, dest_path)
                self.queue.task_done()
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"Error processing file event: {e}")

class AsyncEventHandler(FileSystemEventHandler):
    def __init__(self, event_queue):
        super().__init__()
        self.queue = event_queue

    def on_moved(self, event):
        if not event.is_directory:
            self.queue.put({
                'type': 'moved',
                'src_path': event.src_path,
                'dest_path': event.dest_path
            })

    def on_modified(self, event):
        if not event.is_directory:
            self.queue.put({
                'type': 'modified',
                'src_path': event.src_path,
                'dest_path': None
            })
            
    def on_deleted(self, event):
        if not event.is_directory:
            self.queue.put({
                'type': 'deleted',
                'src_path': event.src_path,
                'dest_path': None
            })

class MonitorManager:
    def __init__(self):
        self.observer = Observer()
        self.event_queue = queue.Queue(maxsize=10000)
        self.processor = FileEventProcessor(self.event_queue)
        self.handler = AsyncEventHandler(self.event_queue)
        self.directories = config_manager.get("protected_directories", [])

    def start(self):
        self.processor.start()
        count = 0
        for directory in self.directories:
            try:
                self.observer.schedule(self.handler, directory, recursive=True)
                count += 1
                logger.info(f"Monitoring directory: {directory}")
            except Exception as e:
                logger.error(f"Failed to monitor {directory}: {e}")
                
        if count > 0:
            self.observer.start()
            logger.info("Watchdog observer started.")
        else:
            logger.warning("No directories could be monitored.")

    def stop(self):
        self.processor.running = False
        if self.observer.is_alive():
            self.observer.stop()
            self.observer.join()
        logger.info("Watchdog observer stopped.")

monitor_manager = MonitorManager()
