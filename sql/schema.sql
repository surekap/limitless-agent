-- Enhanced database schema for lifelog processing system

-- Table for storing lifelogs (already exists, documenting structure)
CREATE TABLE IF NOT EXISTS lifelogs (
  id VARCHAR(255) PRIMARY KEY,
  title TEXT,
  start_time DATETIME,
  end_time DATETIME,
  contents TEXT,
  markdown TEXT,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Table for tracking lifelog processing results
CREATE TABLE IF NOT EXISTS lifelog_processing (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lifelog_id VARCHAR(255) NOT NULL,
  intent_detected TEXT,
  handler_name VARCHAR(255),
  handler_data JSON,
  execution_status ENUM('pending', 'running', 'completed', 'failed') DEFAULT 'pending',
  execution_result TEXT,
  execution_error TEXT,
  execution_duration_ms INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (lifelog_id) REFERENCES lifelogs(id) ON DELETE CASCADE,
  INDEX idx_lifelog_processing_status (execution_status),
  INDEX idx_lifelog_processing_lifelog_id (lifelog_id),
  INDEX idx_lifelog_processing_created_at (created_at)
);

-- Table for registered handlers
CREATE TABLE IF NOT EXISTS handlers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  function_schema JSON NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Table for handler execution logs (detailed logging)
CREATE TABLE IF NOT EXISTS handler_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  processing_id INT NOT NULL,
  log_level ENUM('info', 'warn', 'error', 'debug') DEFAULT 'info',
  message TEXT NOT NULL,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (processing_id) REFERENCES lifelog_processing(id) ON DELETE CASCADE,
  INDEX idx_handler_logs_processing_id (processing_id),
  INDEX idx_handler_logs_level (log_level),
  INDEX idx_handler_logs_created_at (created_at)
);

-- Add processed column to lifelogs if it doesn't exist
ALTER TABLE lifelogs 
ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_lifelogs_processed ON lifelogs(processed);
CREATE INDEX IF NOT EXISTS idx_lifelogs_start_time ON lifelogs(start_time);
CREATE INDEX IF NOT EXISTS idx_lifelogs_created_at ON lifelogs(created_at);