'use strict';

const { Router } = require('express');
const messageRepo = require('../lib/messageRepo');

const router = Router();

// GET /api/messages/chats  — must be before /:id to avoid route conflict
router.get('/chats', async (req, res) => {
  try {
    res.json(await messageRepo.listChats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/messages?chatId=&groupId=&limit=&before=
router.get('/', async (req, res) => {
  try {
    const { chatId, groupId, limit, before } = req.query;
    res.json(await messageRepo.list({
      chatId:  chatId  || undefined,
      groupId: groupId || undefined,
      limit:   limit   ? Math.min(parseInt(limit, 10), 200) : 50,
      before:  before  ? parseInt(before, 10) : undefined,
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
