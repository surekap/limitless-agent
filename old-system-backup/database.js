const pool = require('../db');

class DatabaseService {
  
  async getUnprocessedLifelogs(limit = 10) {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        `SELECT * FROM lifelogs 
         WHERE processed = FALSE 
         ORDER BY start_time ASC 
         LIMIT ?`,
        [limit]
      );
      return rows;
    } finally {
      conn.release();
    }
  }

  async markLifelogAsProcessed(lifelogId) {
    const conn = await pool.getConnection();
    try {
      await conn.query(
        `UPDATE lifelogs SET processed = TRUE WHERE id = ?`,
        [lifelogId]
      );
    } finally {
      conn.release();
    }
  }

  async createProcessingRecord(lifelogId, intentDetected, handlerName, handlerData) {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query(
        `INSERT INTO lifelog_processing (lifelog_id, intent_detected, handler_name, handler_data, execution_status) 
         VALUES (?, ?, ?, ?, 'pending')`,
        [lifelogId, intentDetected, handlerName, JSON.stringify(handlerData)]
      );
      return result.insertId;
    } finally {
      conn.release();
    }
  }

  async updateProcessingStatus(processingId, status, result = null, error = null, duration = null) {
    const conn = await pool.getConnection();
    try {
      await conn.query(
        `UPDATE lifelog_processing 
         SET execution_status = ?, execution_result = ?, execution_error = ?, execution_duration_ms = ?, updated_at = NOW()
         WHERE id = ?`,
        [status, result, error, duration, processingId]
      );
    } finally {
      conn.release();
    }
  }

  async logHandlerExecution(processingId, level, message, metadata = null) {
    const conn = await pool.getConnection();
    try {
      await conn.query(
        `INSERT INTO handler_logs (processing_id, log_level, message, metadata) 
         VALUES (?, ?, ?, ?)`,
        [processingId, level, message, metadata ? JSON.stringify(metadata) : null]
      );
    } finally {
      conn.release();
    }
  }

  async getRegisteredHandlers() {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        `SELECT * FROM handlers WHERE is_enabled = TRUE`
      );
      return rows;
    } finally {
      conn.release();
    }
  }

  async registerHandler(name, description, functionSchema) {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query(
        `INSERT INTO handlers (name, description, function_schema) 
         VALUES (?, ?, ?) 
         ON DUPLICATE KEY UPDATE 
         description = VALUES(description), 
         function_schema = VALUES(function_schema), 
         updated_at = NOW()`,
        [name, description, JSON.stringify(functionSchema)]
      );
      return result.insertId || result.affectedRows;
    } finally {
      conn.release();
    }
  }

  async getProcessingHistory(lifelogId) {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        `SELECT p.*, h.message as log_message, h.log_level, h.created_at as log_created_at
         FROM lifelog_processing p
         LEFT JOIN handler_logs h ON p.id = h.processing_id
         WHERE p.lifelog_id = ?
         ORDER BY p.created_at DESC, h.created_at ASC`,
        [lifelogId]
      );
      return rows;
    } finally {
      conn.release();
    }
  }

  async getProcessingStats(days = 7) {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        `SELECT 
           COUNT(*) as total_processed,
           SUM(CASE WHEN execution_status = 'completed' THEN 1 ELSE 0 END) as successful,
           SUM(CASE WHEN execution_status = 'failed' THEN 1 ELSE 0 END) as failed,
           AVG(execution_duration_ms) as avg_duration_ms,
           handler_name
         FROM lifelog_processing 
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY handler_name`,
        [days]
      );
      return rows;
    } finally {
      conn.release();
    }
  }
}

module.exports = new DatabaseService();