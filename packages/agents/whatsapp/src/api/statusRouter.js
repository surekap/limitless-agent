'use strict';

const { Router } = require('express');

const router    = Router();
let _waState    = 'INITIALIZING';
const _startedAt = new Date().toISOString();

/** Called from app.js whenever the WhatsApp client state changes. */
function setWaState(state) {
  if (state !== _waState) {
    console.log(`[status] WA state: ${_waState} → ${state}`);
  }
  _waState = state;
}

// GET /api/status
router.get('/', (req, res) => {
  res.json({
    status:    'ok',
    waState:   _waState,
    startedAt: _startedAt,
    timestamp: new Date().toISOString(),
    uptime:    Math.floor(process.uptime()),
  });
});

module.exports = router;
module.exports.setWaState = setWaState;
